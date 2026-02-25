"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import TopToast from "@/app/_components/TopToast";
import RefreshButton from "@/app/_components/RefreshButton";

type Asset = "USDT" | "BTC" | "ETH" | "BNB";

type Network = "TRC20" | "BTC" | "ETH" | "BEP20";

type AddressState = Partial<{
  usdt_deposit_address_trc20: string | null;
  btc_deposit_address: string | null;
  eth_deposit_address: string | null;
  bnb_deposit_address_bep20: string | null;
}>;

type Props = {
  initialAddresses: AddressState;
  initialDeposits?: Deposit[];
};

type Deposit = {
  id: string;
  reference: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  address: string;
  coin: string;
  network: string | null;
  transaction_hash: string | null;
};

const ASSETS: { asset: Asset; label: string; networks: { network: Network; label: string }[] }[] = [
  { asset: "USDT", label: "USDT", networks: [{ network: "TRC20", label: "TRC 20" }] },
  { asset: "BTC", label: "BTC", networks: [{ network: "BTC", label: "BTC" }] },
  { asset: "ETH", label: "ETH", networks: [{ network: "ETH", label: "ERC 20" }] },
  { asset: "BNB", label: "BNB", networks: [{ network: "BEP20", label: "BEP 20" }] },
];

const coinImageByAsset: Record<Asset, string> = {
  BTC: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  ETH: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  USDT: "https://assets.coingecko.com/coins/images/325/large/Tether.png",
  BNB: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
};

function getColumn(asset: Asset, network: Network): keyof AddressState {
  if (asset === "USDT" && network === "TRC20") return "usdt_deposit_address_trc20";
  if (asset === "BTC" && network === "BTC") return "btc_deposit_address";
  if (asset === "ETH" && network === "ETH") return "eth_deposit_address";
  return "bnb_deposit_address_bep20";
}

const formatDepositReference = (ref: string) => {
  const s = (ref || "").trim();
  if (s.length <= 10) return s;
  return `${s.slice(0, 3)}...${s.slice(-3)}`;
};

const formatDepositAmount = (amount: any) => {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "0";
  if (n !== 0 && Math.abs(n) < 1) {
    const s = n.toFixed(8);
    return s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 });
};

export default function WalletContent({ initialAddresses, initialDeposits }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [asset, setAsset] = useState<Asset>("USDT");
  const [network, setNetwork] = useState<Network>("TRC20");
  const [addresses, setAddresses] = useState<AddressState>(initialAddresses);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const deposits = initialDeposits ?? [];

  const [assetOpen, setAssetOpen] = useState(false);
  const assetDropdownRef = useRef<HTMLDivElement | null>(null);

  const [networkOpen, setNetworkOpen] = useState(false);
  const networkDropdownRef = useRef<HTMLDivElement | null>(null);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");

  const col = useMemo(() => getColumn(asset, network), [asset, network]);
  const address = addresses[col] ?? null;

  const supportedNetworks = useMemo(() => {
    const found = ASSETS.find((a) => a.asset === asset);
    return found?.networks ?? [];
  }, [asset]);

  useEffect(() => {
    const fromQuery = (searchParams.get("asset") || "").toUpperCase();
    if (fromQuery !== "BTC" && fromQuery !== "ETH" && fromQuery !== "USDT" && fromQuery !== "BNB") return;

    setAsset(fromQuery as Asset);
    if (fromQuery === "USDT") setNetwork("TRC20");
    if (fromQuery === "BTC") setNetwork("BTC");
    if (fromQuery === "ETH") setNetwork("ETH");
    if (fromQuery === "BNB") setNetwork("BEP20");
  }, [searchParams]);

  async function refresh() {
    setIsRefreshing(true);
    try {
      router.refresh();
    } finally {
      // router.refresh() is async but doesn't provide a promise we can await for data.
      // This small delay prevents the UI from flickering.
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }

  const networkLabel = useMemo(() => {
    return supportedNetworks.find((n) => n.network === network)?.label ?? network;
  }, [network, supportedNetworks]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      if (assetOpen && assetDropdownRef.current && !assetDropdownRef.current.contains(target)) {
        setAssetOpen(false);
      }

      if (networkOpen && networkDropdownRef.current && !networkDropdownRef.current.contains(target)) {
        setNetworkOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAssetOpen(false);
        setNetworkOpen(false);
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [assetOpen, networkOpen]);

  async function onCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setToastVariant("success");
      setToastMessage("Address copied");
      setToastOpen(true);
    } catch {
      setToastVariant("error");
      setToastMessage("Couldn't copy address");
      setToastOpen(true);
    }
  }

  async function generate() {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/wallet/generate-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, network }),
      });

      const json = (await res.json()) as { address?: string; error?: string };
      if (!res.ok || !json.address) {
        setToastVariant("error");
        setToastMessage(json.error || "Failed to generate wallet");
        setToastOpen(true);
        return;
      }

      setAddresses((prev) => ({ ...prev, [col]: json.address }));
      setToastVariant("success");
      setToastMessage("Wallet generated");
      setToastOpen(true);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <TopToast open={toastOpen} message={toastMessage} variant={toastVariant} onClose={() => setToastOpen(false)} />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-medium">Deposit Crypto</h2>
          <p className="mt-1 text-[12px] font-semibold text-[#9597A3]">Send crypto to your wallet address to deposit funds</p>
        </div>

        <RefreshButton onClick={refresh} isRefreshing={isRefreshing} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-[12px] bg-[#16161E] border border-[#2E2E3A] p-5">
          <h3 className="text-[16px] font-medium">Select crypto asset</h3>

          <div className="mt-4">
            <p className="text-[14px] text-[#FFFFFF]">Cryptocurrency</p>

            <div ref={assetDropdownRef} className="relative mt-3">
              <button
                type="button"
                onClick={() => setAssetOpen((v) => !v)}
                className="flex h-[48px] w-full items-center justify-between rounded-[12px] bg-[#20202C] border border-[#2E2E3A] px-4 text-[14px]"
              >
                <span className="flex items-center gap-2">
                  <span className="relative h-[20px] w-[20px] overflow-hidden rounded-full">
                    <Image src={coinImageByAsset[asset]} alt="" fill sizes="20px" />
                  </span>
                  <span>{asset}</span>
                </span>

                <svg width="14" height="9" viewBox="0 0 14 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1.5L7 7.5L13 1.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {assetOpen ? (
                <div className="absolute left-0 right-0 top-[54px] z-20 overflow-hidden rounded-[12px] border border-[#2E2E3A] bg-[#20202C]">
                  {ASSETS.map((a) => {
                    const active = a.asset === asset;
                    return (
                      <button
                        key={a.asset}
                        type="button"
                        onClick={() => {
                          setAsset(a.asset);
                          const firstNetwork = a.networks[0]?.network;
                          if (firstNetwork) setNetwork(firstNetwork);
                          setAssetOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] ${
                          active ? "bg-white/10" : "hover:bg-white/5"
                        }`}
                      >
                        <span className="relative h-[20px] w-[20px] overflow-hidden rounded-full">
                          <Image src={coinImageByAsset[a.asset]} alt="" fill sizes="20px" />
                        </span>
                        <span>{a.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[16px] text-[#FFFFFF]">Network</p>

            <div ref={networkDropdownRef} className="relative mt-3">
              <button
                type="button"
                onClick={() => setNetworkOpen((v) => !v)}
                className="flex h-[48px] w-full items-center justify-between rounded-[12px] bg-[#20202C] border border-[#2E2E3A] px-4 text-[14px]"
              >
                <span className="flex items-center gap-2">
                  <span>{supportedNetworks.find((n) => n.network === network)?.label ?? network}</span>
                </span>

                <svg width="14" height="9" viewBox="0 0 14 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1.5L7 7.5L13 1.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {networkOpen ? (
                <div className="absolute left-0 right-0 top-[54px] z-20 overflow-hidden rounded-[12px] border border-[#2E2E3A] bg-[#20202C]">
                  {supportedNetworks.map((n) => {
                    const active = n.network === network;
                    return (
                      <button
                        key={n.network}
                        type="button"
                        onClick={() => {
                          setNetwork(n.network);
                          setNetworkOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] ${
                          active ? "bg-white/10" : "hover:bg-white/5"
                        }`}
                      >
                        <span>{n.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-8 text-[12px] text-[#fffff]">
            <div className="flex items-center justify-between">
              <span>Current rate:</span>
              <span className="text-white font-medium">₦1,650.00</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Minimum deposit:</span>
              <span className="text-white font-medium">650.00</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Processing time:</span>
              <span className="text-white font-medium">₦20.00</span>
            </div>
          </div>
        </section>

        <section className="rounded-[12px] bg-[#16161E] border border-[#2E2E3A] p-5">
          <h3 className="text-[16px] font-medium">Wallet address</h3>

          <div className="mt-4">
            

            {address ? (
              <div className="mt-4">
                <div className="flex justify-center">
                  <div className="bg-white p-3">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                        address,
                      )}`}
                      alt=""
                      width={100}
                      height={100}
                      className="block"
                    />
                  </div>
                </div>
                      <p className="text-[14px] text-white font-medium mt-3">{asset} ({networkLabel}) Address</p>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-[12px] border border-[#2E2E3A] bg-[#201F2D] px-2 py-[2px]">
                  <p className="text-[12px] text-[#fffff] break-all pr-2">{address}</p>
                  <button
                    type="button"
                    onClick={onCopy}
                    className="shrink-0 rounded-[10px] p-2 hover:bg-white/5"
                    aria-label="Copy address"
                  >
                    <Image src="/images/copy.svg" alt="" width={15} height={15} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={generate}
                disabled={isGenerating}
                className={`mt-4 w-full rounded-[12px] bg-[#3B82F6] py-3 text-[14px] font-medium ${
                  isGenerating ? "opacity-60" : ""
                }`}
              >
                {isGenerating ? "Generating..." : "Generate wallet"}
              </button>
            )}

            <div className="mt-4 rounded-[12px] bg-[#2E2E3A] border border-[#2E2E3A] p-3 text-[12px] text-[#fffff] font-normal">
             <span className="font-medium">Important:</span> Only send {asset} on the {networkLabel} network to this address.
            </div>
          </div>
        </section>

        <section className="rounded-[12px] bg-[#16161E] border border-[#2E2E3A] p-5">
          <h3 className="text-[16px] font-medium">Deposit Instructions</h3>

          <ol className="mt-7 grid gap-4 text-[14px] text-[#fffff] list-decimal pl-4">
            <li>Select your preferred cryptocurrency and network</li>
            <li>Generate your deposit address (first time only)</li>
            <li>Send funds to the address from your external wallet</li>
            <li>Wait for network confirmations</li>
            <li>Funds will be automatically converted to Naira at the current rate</li>
          </ol>
        </section>
      </div>

      <section className="mt-6 rounded-[12px] bg-[#16161E] border border-[#2E2E3A] p-5">
        <h3 className="text-[18px] font-medium text-white">Recent Deposits</h3>

        <div className="mt-4 overflow-hidden rounded-[12px] border border-[#2B2A3A]">
          <div
            className={`overflow-y-auto ${deposits.length > 3 ? "max-h-[280px]" : ""}`}
            style={{ scrollbarGutter: "stable" }}
          >
            <div className="sticky top-0 z-10 bg-[#20202C]">
              <div className="grid grid-cols-5 gap-3 px-[24px] py-[24px] text-[14px] text-[#9597A3]">
                <div>Reference</div>
                <div>Type</div>
                <div>Amount</div>
                <div>Status</div>
                <div>Date</div>
              </div>
              <div className="h-px bg-white/10" />
            </div>

            {deposits.length === 0 ? (
              <div className="px-5 py-8 text-[14px] text-[#9AA2AC] text-center">No deposits yet.</div>
            ) : (
              deposits.map((d) => {
                const date = d.created_at ? new Date(d.created_at) : null;
                const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : "-";
                const status = (d.status || "").toLowerCase().trim();
                const normalizedStatus = status.includes("unconfirmed") ? "pending" : status;
                const isConfirmedLike = normalizedStatus.includes("confirm");
                const statusClass =
                  normalizedStatus === "completed" ||
                  normalizedStatus === "success" ||
                  normalizedStatus === "confirmed" ||
                  isConfirmedLike
                    ? "bg-[#00A82D1A] text-[#00A82D]"
                    : normalizedStatus === "pending"
                      ? "bg-[#F59E0B1A] text-[#F59E0B]"
                      : normalizedStatus === "failed"
                        ? "bg-[#EF44441A] text-[#EF4444]"
                        : "bg-white/10 text-white/80";

                return (
                  <div
                    key={d.id}
                    className="grid grid-cols-5 gap-3 px-[24px] py-[18px] text-[14px] items-center"
                  >
                    <div className="flex items-center min-w-0">
                      <span className="flex-1 min-w-0 truncate whitespace-nowrap" title={d.reference || ""}>
                        {formatDepositReference(d.reference || "")}
                      </span>
                    </div>
                    <div className="font-medium text-[14px]">
                      {(d.coin || "").toUpperCase()} {d.type}
                    </div>
                    <div>
                      <p className="font-semibold text-[14px]">{formatDepositAmount(d.amount ?? 0)}</p>
                    </div>
                    <div>
                      <span
                        className={`inline-flex rounded-[12px] px-3 py-1 text-[12px] font-semibold ${statusClass}`}
                      >
                        {normalizedStatus}
                      </span>
                    </div>
                    <div className="text-[#9AA2AC] text-[14px]">{dateLabel}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
