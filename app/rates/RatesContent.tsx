"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TopToast from "@/app/_components/TopToast";
import RefreshButton from "@/app/_components/RefreshButton";

type Market = {
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number | null;
};

type Symbol = "USDT" | "BTC" | "ETH" | "BNB";

type Props = {
  initialMarkets: Record<string, Market>;
  initialUpdatedAtIso: string;
  initialNairaRates: Record<string, number>;
};

function formatUsd(v: number) {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: v < 1 ? 4 : 2,
  });
}

function formatNgn(v: number) {
  return v.toLocaleString("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  });
}

function formatPct(v: number | null | undefined) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export default function RatesContent({ initialMarkets, initialUpdatedAtIso, initialNairaRates }: Props) {
  const router = useRouter();
  const [markets, setMarkets] = useState<Record<string, Market>>(initialMarkets);
  const [updatedAtIso, setUpdatedAtIso] = useState<string>(initialUpdatedAtIso);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [nairaRates, setNairaRates] = useState<Record<string, number>>(initialNairaRates);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState<"error" | "success">("success");

  const updatedAt = useMemo(() => new Date(updatedAtIso), [updatedAtIso]);

  const [calcSymbol, setCalcSymbol] = useState<Symbol>("USDT");
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcAmount, setCalcAmount] = useState<string>("100");
  const [isCalculating, setIsCalculating] = useState(false);

  const [quoteOpen, setQuoteOpen] = useState(false);

  useEffect(() => {
    if (!quoteOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setQuoteOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [quoteOpen]);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/markets", { cache: "no-store" });
      const json = (await res.json()) as {
        markets: Record<string, Market>;
        updatedAt: string;
        nairaRates?: Record<string, number>;
      };
      if (json && typeof json === "object") {
        setMarkets(json.markets ?? {});
        if (typeof json.updatedAt === "string") setUpdatedAtIso(json.updatedAt);
        if (json.nairaRates && typeof json.nairaRates === "object") setNairaRates(json.nairaRates);
      }

      setToastVariant("success");
      setToastMessage("Rates updated");
      setToastOpen(true);
    } finally {
      setIsRefreshing(false);
    }
  }

  function renderTrendBadge(pct: number) {
    const up = pct >= 0;

    return (
      <span
        className={`rounded-[10px] px-2 py-1 text-[10px] font-semibold ${
          up ? "bg-[#00FF4433] text-[#00FF44]" : "bg-[#F4433626] text-[#F44336]"
        }`}
      >
        <span className="flex items-center gap-1">
          {up ? (
            <svg width="11" height="7" viewBox="0 0 11 7" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M1 6L4 3L6 5L10 1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8 1H10V3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="11" height="7" viewBox="0 0 11 7" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M10 1L7 4L5 2L1 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3 6H1V4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          <span>{formatPct(pct)}</span>
        </span>
      </span>
    );
  }

  const calcMarket = markets[calcSymbol];
  const calcRate = nairaRates[calcSymbol] ?? 0;

  const exchangeCards = useMemo(() => {
    return [
      { sym: "USDT", sub: "to Nigerian Naira", rate: nairaRates.USDT ?? 0 },
      { sym: "BTC", sub: "to Nigerian Naira", rate: nairaRates.BTC ?? 0 },
      { sym: "ETH", sub: "to Nigerian Naira", rate: nairaRates.ETH ?? 0 },
      { sym: "BNB", sub: "to Nigerian Naira", rate: nairaRates.BNB ?? 0 },
    ] as const;
  }, [nairaRates.BNB, nairaRates.BTC, nairaRates.ETH, nairaRates.USDT]);

  const calcAmountNum = Number(calcAmount);
  const coinAmount = Number.isFinite(calcAmountNum) ? calcAmountNum : 0;
  const feeRate = 0.01;
  const coinUsdPrice = calcSymbol === "USDT" ? 1 : Number(calcMarket?.current_price ?? 0);
  const adminCoinToNgnRate = coinUsdPrice * calcRate;
  const grossNgn = coinAmount * adminCoinToNgnRate;
  const feeNgn = grossNgn * feeRate;
  const receiveNgn = grossNgn - feeNgn;

  return (
    <div className="relative px-6 py-6">
      <TopToast
        open={toastOpen}
        message={toastMessage}
        variant={toastVariant}
        onClose={() => setToastOpen(false)}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-medium">Exchange rate</h2>
          <p className="mt-1 text-[12px] font-semibold text-[#9597A3]">Last updated : {updatedAt.toLocaleString()}</p>
        </div>

        <RefreshButton onClick={refresh} isRefreshing={isRefreshing} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        {exchangeCards.map((c) => {
          const market = markets[c.sym as keyof typeof markets];
          const pct = market?.price_change_percentage_24h ?? 0;

          return (
            <div key={c.sym} className="rounded-[12px] bg-[#16161E] border border-[#2E2E3A] p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {market?.image ? (
                    <div className="relative h-[28px] w-[28px] overflow-hidden rounded-full">
                      <Image src={market.image} alt="" fill sizes="28px" />
                    </div>
                  ) : (
                    <div className="h-[28px] w-[28px] rounded-full flex items-center justify-center text-[12px] font-semibold">
                      {c.sym[0]}
                    </div>
                  )}
                  <div>
                    <p className="text-[14px] font-semibold">{c.sym}</p>
                    <p className="text-[10px] text-white">{c.sub}</p>
                  </div>
                </div>

                {renderTrendBadge(pct)}
              </div>

              <div className="mt-8">
                <p className="text-[18px] font-bold">₦{c.rate.toLocaleString()}</p>
                <p className="mt-1 text-[12px] text-white">per 1$</p>
              </div>

              <button
                type="button"
                onClick={() => router.push(`/wallet?asset=${encodeURIComponent(String(c.sym).toUpperCase())}`)}
                className="mt-6 w-full rounded-[10px] bg-[#3B82F6] py-2 text-[12px] font-medium"
              >
                Deposit Now
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-[12px] bg-[#16161E] border border-[#2E2E3A] p-5">
          <div className="flex items-center gap-3">
            <Image src="/images/calculator.svg" alt="" width={14} height={14} />
            <h3 className="text-[16px] font-medium">Rate Calculator</h3>
          </div>

          <div className="mt-6">
            <p className="text-[14px] text-white">Select Cryptocurrency</p>

            <div className="relative mt-3">
              <button
                type="button"
                onClick={() => setCalcOpen((v) => !v)}
                className="flex h-[48px] w-full items-center justify-between rounded-[12px] bg-[#20202C] border border-[#2E2E3A] px-4 text-[14px]"
              >
                <span className="flex items-center gap-2">
                  {calcMarket?.image ? (
                    <span className="relative h-[20px] w-[20px] overflow-hidden rounded-full">
                      <Image src={calcMarket.image} alt="" fill sizes="20px" />
                    </span>
                  ) : (
                    <span className="h-[20px] w-[20px] rounded-full bg-white/10 flex items-center justify-center text-[10px] font-semibold">
                      {calcSymbol[0]}
                    </span>
                  )}
                  <span>{calcSymbol}</span>
                </span>

                <svg width="14" height="9" viewBox="0 0 14 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1.5L7 7.5L13 1.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {calcOpen ? (
                <div className="absolute left-0 right-0 top-[54px] z-20 overflow-hidden rounded-[12px] border border-[#2E2E3A] bg-[#20202C]">
                  {exchangeCards.map((c) => {
                    const m = markets[c.sym as keyof typeof markets];
                    const active = c.sym === calcSymbol;

                    return (
                      <button
                        key={c.sym}
                        type="button"
                        onClick={() => {
                          setCalcSymbol(c.sym);
                          setCalcOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] ${
                          active ? "bg-white/10" : "hover:bg-white/5"
                        }`}
                      >
                        {m?.image ? (
                          <span className="relative h-[20px] w-[20px] overflow-hidden rounded-full">
                            <Image src={m.image} alt="" fill sizes="20px" />
                          </span>
                        ) : (
                          <span className="h-[20px] w-[20px] rounded-full bg-white/10 flex items-center justify-center text-[10px] font-semibold">
                            {c.sym[0]}
                          </span>
                        )}
                        <span>{c.sym}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-[14px] text-white">Enter Amount</p>
            <input
              value={calcAmount}
              onChange={(e) => setCalcAmount(e.target.value)}
              className="mt-3 h-[48px] w-full rounded-[12px] bg-[#20202C] border border-[#2E2E3A] px-4 text-[14px]"
              placeholder="100"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (!Number.isFinite(coinAmount) || coinAmount <= 0) {
                setToastVariant("error");
                setToastMessage("Enter a valid amount");
                setToastOpen(true);
                return;
              }
              setIsCalculating(true);
              window.setTimeout(() => {
                setIsCalculating(false);
                setQuoteOpen(true);
              }, 2000);
            }}
            disabled={isCalculating}
            className="mt-6 w-full rounded-[12px] bg-[#3B82F6] py-3 text-[16px] font-medium"
          >
            {isCalculating ? "Calculating..." : "Calculate"}
          </button>

          <div className="mt-6 flex justify-end">
            <div className="relative inline-flex items-center group">
              <button
                type="button"
                aria-label="Info"
                className="flex cursor-pointer h-[28px] w-[28px] items-center justify-center rounded-full border border-[#2E2E3A] bg-[#20202C] text-white"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M7 13C10.3137 13 13 10.3137 13 7C13 3.68629 10.3137 1 7 1C3.68629 1 1 3.68629 1 7C1 10.3137 3.68629 13 7 13Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path d="M7 10V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M7 4.5H7.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-[36px] right-0 hidden w-[260px] rounded-[12px] border border-[#2E2E3A] bg-[#20202C] p-4 text-[12px] text-[#A0A3AC] shadow-lg group-hover:block group-focus-within:block"
              >
                <span className="font-semibold text-white">Note:</span> Rate may change without notice. Actual conversion will use
                the rate at the time of transaction completion.
              </div>
            </div>
          </div>

          <div className="sr-only">{formatNgn(grossNgn)}</div>
        </section>

        {quoteOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0A0FCC] px-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setQuoteOpen(false);
            }}
          >
            <div className="w-full max-w-[420px] rounded-[18px] border border-[#2E2E3A] bg-[#16161E] p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[18px] font-medium">You will receive</p>
                  <p className="mt-3 text-[36px] font-bold leading-none">{formatNgn(receiveNgn)}</p>
                </div>

                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setQuoteOpen(false)}
                  className="flex h-[28px] w-[28px] items-center justify-center"
                >
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M14.5 7.5L7.5 14.5"
                      stroke="#E11D48"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7.5 7.5L14.5 14.5"
                      stroke="#E11D48"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11 21C16.5228 21 21 16.5228 21 11C21 5.47715 16.5228 1 11 1C5.47715 1 1 5.47715 1 11C1 16.5228 5.47715 21 11 21Z"
                      stroke="#E11D48"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
              </div>

              <div className="mt-8">
                <p className="text-[18px]">For</p>
                <p className="mt-2 text-[32px] font-bold leading-none">
                  {coinAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {calcSymbol}
                </p>
              </div>

              <div className="mt-8 rounded-[12px] bg-[#20202C] border border-[#2E2E3A] p-4 text-[12px] text-[#A0A3AC]">
                <div className="flex items-center justify-between">
                  <span className="text-white/80">Admin rate:</span>
                  <span className="font-medium">{formatNgn(adminCoinToNgnRate)} / 1 {calcSymbol}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-white/80">Amount:</span>
                  <span className="font-medium">{coinAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {calcSymbol}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-white/80">Gross NGN:</span>
                  <span className="font-medium">{formatNgn(grossNgn)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-white/80">Fee (1%):</span>
                  <span className="font-medium">{formatNgn(feeNgn)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-white/80">You receive:</span>
                  <span className="font-medium">{formatNgn(receiveNgn)}</span>
                </div>
              </div>


              <div className="mt-6 h-px w-full bg-[#2E2E3A]" />

              <button
                type="button"
                onClick={() => {
                  setQuoteOpen(false);
                  router.push(`/wallet?asset=${encodeURIComponent(calcSymbol)}`);
                }}
                className="mt-6 w-full rounded-[12px] bg-[#3B82F6] py-3 text-[16px] font-medium"
              >
                Deposit Now
              </button>

              <div className="mt-6 rounded-[12px] bg-[#20202C] border border-[#2E2E3A] p-4 text-[12px] text-[#A0A3AC]">
                <span className="font-semibold text-white">Note:</span> Rate may change without notice. The actual conversion will
                use the rate at the time of transaction completion
              </div>
            </div>
          </div>
        ) : null}

        <section className="rounded-[12px] bg-[#16161E] border border-[#2E2E3A] p-5">
          <h3 className="text-[16px] font-medium">Crypto Prices</h3>

          <div className="mt-[40px] grid gap-[25px]">
            {([
              { sym: "BTC" as const, m: markets.BTC },
              { sym: "ETH" as const, m: markets.ETH },
              { sym: "USDT" as const, m: markets.USDT },
              { sym: "BNB" as const, m: markets.BNB },
            ] as const).map((r) => {
              const pct = r.m?.price_change_percentage_24h ?? 0;
              const price = r.m?.current_price ?? 0;

              return (
                <div key={r.sym} className="flex items-center justify-between rounded-[12px] border border-[#2E2E3A] p-[12px]">
                  <div className="flex items-center gap-2">
                    {r.m?.image ? (
                      <div className="relative h-[22px] w-[22px] overflow-hidden rounded-full">
                        <Image src={r.m.image} alt="" fill sizes="22px" />
                      </div>
                    ) : (
                      <div className="h-[22px] w-[22px] rounded-full bg-white/10 flex items-center justify-center text-[10px] font-semibold">
                        {r.sym[0]}
                      </div>
                    )}
                    <span className="text-[12px] font-normal">{r.sym}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium">{formatUsd(price)}</span>
                    {renderTrendBadge(pct)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[12px] bg-[#16161E] border border-[#2E2E3A] p-5">
          <h3 className="text-[16px] font-medium">Crypto To Naira Prices</h3>

          <div className="mt-[40px] grid gap-[25px]">
            {([
              { sym: "BTC" as const, m: markets.BTC, nairaRate: nairaRates.BTC ?? 0 },
              { sym: "ETH" as const, m: markets.ETH, nairaRate: nairaRates.ETH ?? 0 },
              { sym: "USDT" as const, m: markets.USDT, nairaRate: nairaRates.USDT ?? 0 },
              { sym: "BNB" as const, m: markets.BNB, nairaRate: nairaRates.BNB ?? 0 },
            ] as const).map((r) => {
              const pct = r.m?.price_change_percentage_24h ?? 0;
              const usd = r.m?.current_price ?? 0;
              const ngn = usd * r.nairaRate;

              return (
                <div key={r.sym} className="flex items-center justify-between rounded-[12px] border border-[#2E2E3A] px-4 py-3">
                  <div className="flex items-center gap-2">
                    {r.m?.image ? (
                      <div className="relative h-[22px] w-[22px] overflow-hidden rounded-full">
                        <Image src={r.m.image} alt="" fill sizes="22px" />
                      </div>
                    ) : (
                      <div className="h-[22px] w-[22px] rounded-full bg-white/10 flex items-center justify-center text-[10px] font-semibold">
                        {r.sym[0]}
                      </div>
                    )}
                    <span className="text-[12px] font-normal">{r.sym}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium">{formatNgn(ngn)}</span>
                    {renderTrendBadge(pct)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
