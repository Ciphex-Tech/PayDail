"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import TopToast from "@/app/_components/TopToast";
import { errorMessageForToast, fetchWithTimeout } from "@/lib/network/safeFetch";
import { createIdempotencyKey } from "@/lib/network/idempotency";

type Bank = { id: number; name: string; code: string };

type Withdrawal = {
  id: string;
  reference: string;
  amount: number;
  fee?: number | null;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
};

type Props = {
  nairaBalance: number;
  initialWithdrawals: Withdrawal[];
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  queued: "Pending",
  review_required: "Pending",
  approved: "Pending",
  processing: "Pending",
  completed: "Successful",
  failed: "Failed",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400",
  queued: "bg-yellow-500/15 text-yellow-400",
  review_required: "bg-yellow-500/15 text-yellow-400",
  approved: "bg-yellow-500/15 text-yellow-400",
  processing: "bg-yellow-500/15 text-yellow-400",
  completed: "bg-green-500/15 text-[#00A82D]",
  failed: "bg-red-500/15 text-red-400",
};

function formatNgn(amount: number) {
  return `₦${Number(amount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-NG", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function maskAccount(acct: string) {
  if (!acct || acct.length < 6) return acct;
  return acct.slice(0, 3) + "****" + acct.slice(-3);
}

function shortReference(ref: string) {
  const r = String(ref || "");
  if (r.length <= 10) return r;
  return `${r.slice(0, 4)}...${r.slice(-5)}`;
}

export default function WithdrawContent({ nairaBalance, initialWithdrawals }: Props) {
  const router = useRouter();

  const [latestBalance, setLatestBalance] = useState<number>(nairaBalance);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);

  const [bankQuery, setBankQuery] = useState("");
  const [bankDropOpen, setBankDropOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);

  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [verifyState, setVerifyState] = useState<"idle" | "checking" | "verified" | "error">("idle");
  const [verifyError, setVerifyError] = useState("");

  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("Couldn't process the request");
  const [toastVariant, setToastVariant] = useState<"error" | "success">("error");

  const [fees, setFees] = useState<{ small: number; medium: number; large: number } | null>(null);
  const [feesLoading, setFeesLoading] = useState(false);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [processingOpen, setProcessingOpen] = useState(false);

  const [submittedDetails, setSubmittedDetails] = useState<{
    amount: number;
    fee: number;
    bankName: string;
    accountName: string;
    reference: string;
    createdAt: string;
  } | null>(null);

  const [pinSlots, setPinSlots] = useState<string[]>(["", "", "", ""]);
  const pinInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(initialWithdrawals);

  const refreshedByRealtimeRef = useRef(false);

  const bankDropRef = useRef<HTMLDivElement>(null);
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredBanks = useMemo(() => {
    const q = bankQuery.toLowerCase().trim();
    if (!q) return banks;
    return banks.filter((b) => b.name.toLowerCase().includes(q));
  }, [banks, bankQuery]);

  const amountNum = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

  const fee = useMemo(() => {
    if (!fees) return 0;
    if (amountNum >= 100 && amountNum <= 19_999) return fees.small;
    if (amountNum >= 20_000 && amountNum <= 99_999) return fees.medium;
    if (amountNum >= 100_000) return fees.large;
    return 0;
  }, [amountNum, fees]);

  const totalAmount = useMemo(() => {
    return Math.max(0, amountNum + fee);
  }, [amountNum, fee]);

  const amountError = useMemo(() => {
    if (!amount) return "";
    if (!Number.isFinite(amountNum) || amountNum <= 0) return "Enter a valid amount";
    if (amountNum < 100) return "Minimum withdrawal is ₦100";
    if (totalAmount > latestBalance) return `Insufficient balance (₦${latestBalance.toLocaleString()})`;
    return "";
  }, [amount, amountNum, latestBalance, totalAmount]);

  const canSubmit =
    !submitting &&
    selectedBank !== null &&
    verifyState === "verified" &&
    accountName.trim().length > 0 &&
    amountNum >= 100 &&
    totalAmount <= latestBalance &&
    !amountError;

  useEffect(() => {
    setLatestBalance(nairaBalance);
  }, [nairaBalance]);

  useEffect(() => {
    setWithdrawals(initialWithdrawals);
    refreshedByRealtimeRef.current = false;
  }, [initialWithdrawals]);

  async function copyReferenceToClipboard(reference: string) {
    const ref = String(reference || "").trim();
    if (!ref) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(ref);
      } else {
        const input = document.createElement("input");
        input.value = ref;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }

      setToastVariant("success");
      setToastMessage("Reference copied");
      setToastOpen(true);
    } catch {
      setToastVariant("error");
      setToastMessage("Couldn't copy reference");
      setToastOpen(true);
    }
  }

  async function refreshBalance() {
    setBalanceLoading(true);
    try {
      const res = await fetch("/api/balance", { method: "GET", cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; naira_balance?: number };
      if (res.ok && json && typeof json.naira_balance === "number") {
        setLatestBalance(json.naira_balance);
      }
    } finally {
      setBalanceLoading(false);
    }
  }

  useEffect(() => {
    refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let canceled = false;

    async function subscribe() {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId || canceled) return;

      channel = supabase
        .channel(`withdrawals-status-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "withdrawals",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const nextStatus = String((payload as any)?.new?.status ?? "").toLowerCase();
            const prevStatus = String((payload as any)?.old?.status ?? "").toLowerCase();
            if (nextStatus === prevStatus) return;

            if ((nextStatus === "completed" || nextStatus === "failed") && !refreshedByRealtimeRef.current) {
              refreshedByRealtimeRef.current = true;
              router.refresh();
            }
          },
        )
        .subscribe();
    }

    subscribe();

    return () => {
      canceled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadBanks() {
      setBanksLoading(true);
      try {
        const res = await fetch("/api/paystack/banks");
        const json = await res.json();
        setBanks(json.banks ?? []);
      } catch {
        setBanks([]);
      } finally {
        setBanksLoading(false);
      }
    }
    loadBanks();
  }, []);

  useEffect(() => {
    let canceled = false;

    async function loadFees() {
      setFeesLoading(true);
      try {
        const res = await fetchWithTimeout("/api/admin/withdrawal-fees", {
          method: "GET",
          cache: "no-store",
          retry: { retries: 1, delayMs: 400 },
          sensitive: false,
        });
        const json = (await res.json()) as {
          ok?: boolean;
          small_fee?: number;
          medium_fee?: number;
          large_fee?: number;
        };
        if (!canceled && res.ok && json.ok) {
          setFees({
            small: Number(json.small_fee ?? 0),
            medium: Number(json.medium_fee ?? 0),
            large: Number(json.large_fee ?? 0),
          });
        }
      } catch {
        // ignore
      } finally {
        if (!canceled) setFeesLoading(false);
      }
    }

    loadFees();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bankDropRef.current && !bankDropRef.current.contains(e.target as Node)) {
        setBankDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    setVerifyState("idle");
    setVerifyError("");
    setAccountName("");

    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);

    if (!selectedBank || !/^\d{10}$/.test(accountNumber)) return;

    verifyTimerRef.current = setTimeout(async () => {
      setVerifyState("checking");
      try {
        const res = await fetch(
          `/api/paystack/verify-account?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(selectedBank.code)}`,
        );
        const json = await res.json();
        if (res.ok && json.ok && json.account_name) {
          setAccountName(json.account_name);
          setVerifyState("verified");
        } else {
          setVerifyError(json.error ?? "Account not found");
          setVerifyState("error");
        }
      } catch {
        setVerifyError("Network error. Try again.");
        setVerifyState("error");
      }
    }, 800);

    return () => {
      if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
    };
  }, [accountNumber, selectedBank]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setToastOpen(false);
    setToastVariant("error");
    setToastMessage("Couldn't process the request");

    if (!canSubmit || submitting) return;

    setSummaryOpen(true);
  }

  function closeAllModals() {
    setSummaryOpen(false);
    setPinOpen(false);
    setProcessingOpen(false);
  }

  function resetPinInputs() {
    setPinSlots(["", "", "", ""]);
    pinInputsRef.current = [];
  }

  function focusPinSlot(index: number) {
    pinInputsRef.current[index]?.focus();
    pinInputsRef.current[index]?.select();
  }

  function setPinSlot(index: number, value: string) {
    setPinSlots((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handlePinChange(index: number, raw: string) {
    setToastOpen(false);
    const digits = raw.replace(/\D/g, "");

    if (digits.length === 0) {
      setPinSlot(index, "");
      return;
    }

    if (digits.length > 1) {
      setPinSlots((prev) => {
        const next = [...prev];
        let cursor = index;
        for (const ch of digits) {
          if (cursor > 3) break;
          next[cursor] = ch;
          cursor += 1;
        }
        return next;
      });

      const nextIndex = Math.min(index + digits.length, 4) - 1;
      focusPinSlot(Math.min(nextIndex + 1, 3));
      return;
    }

    setPinSlot(index, digits);
    if (index < 3) focusPinSlot(index + 1);
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (pinSlots[index]) {
        setPinSlot(index, "");
        return;
      }

      if (index > 0) {
        focusPinSlot(index - 1);
        setPinSlot(index - 1, "");
      }
      return;
    }

    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusPinSlot(index - 1);
      return;
    }

    if (e.key === "ArrowRight" && index < 3) {
      e.preventDefault();
      focusPinSlot(index + 1);
    }
  }

  async function submitWithdrawalWithPin(pin: string) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      await refreshBalance();
      if (!canSubmit) return false;

      const idempotencyKey = createIdempotencyKey();
      const res = await fetchWithTimeout("/api/withdraw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          withdrawal_type: "bank_transfer",
          amount: amountNum,
          bank_code: selectedBank!.code,
          bank_name: selectedBank!.name,
          account_number: accountNumber,
          account_name: accountName,
          narration: narration.trim() || undefined,
          pin,
        }),
        sensitive: true,
      });

      const json = (await res.json()) as any;

      if (!res.ok || !json.ok) {
        const msg = String(json?.error || json?.message || "Failed to submit withdrawal");
        if (res.status === 401 && msg.toLowerCase().includes("wrong pin")) {
          setToastVariant("error");
          setToastMessage("Wrong PIN");
          setToastOpen(true);
          return false;
        }
        setSubmitError(msg);
        return false;
      }

      const submittedAt = new Date().toISOString();
      setSubmittedDetails({
        amount: amountNum,
        fee: typeof json?.withdrawal?.fee === "number" ? json.withdrawal.fee : fee,
        bankName: selectedBank!.name,
        accountName: accountName,
        reference: String(json?.withdrawal?.reference ?? ""),
        createdAt: submittedAt,
      });

      setProcessingOpen(true);

      setAmount("");
      setNarration("");
      setAccountNumber("");
      setAccountName("");
      setSelectedBank(null);
      setBankQuery("");
      setVerifyState("idle");

      router.refresh();
      refreshBalance();

      const newWd: Withdrawal = {
        id: json.withdrawal.id,
        reference: json.withdrawal.reference,
        amount: amountNum,
        fee: typeof json?.withdrawal?.fee === "number" ? json.withdrawal.fee : fee,
        bank_name: selectedBank!.name,
        account_number: accountNumber,
        account_name: accountName,
        status: json.withdrawal.status,
        failure_reason: null,
        created_at: submittedAt,
      };
      setWithdrawals((prev) => [newWd, ...prev]);
      return true;
    } catch (err) {
      setToastVariant("error");
      setToastMessage(errorMessageForToast(err));
      setToastOpen(true);
      return false;
    } finally {
      setSubmitting(false);
      inFlightRef.current = false;
    }
  
  }

  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1fr_1.4fr]">
      <TopToast open={toastOpen} message={toastMessage} variant={toastVariant} onClose={() => setToastOpen(false)} />
      {/* ── Form ── */}
      <div className="rounded-[12px] border border-[#2D2A3F] bg-[#16161E] p-3.5 md:py-6 md:px-6">
        <div className="flex items-center gap-2 mb-3">
          <svg width="18" height="18" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M10.8637 0L0 5.23069V7.95197H22.5V5.21625L10.8637 0ZM21 6.45197H1.5V6.17325L10.8863 1.65394L21 6.18769V6.45197ZM1.5 18.452H21V19.952H1.5V18.452ZM0 21.077H22.5V22.577H0V21.077ZM1.875 9.45197H3.375V16.952H1.875V9.45197ZM19.125 9.45197H20.625V16.952H19.125V9.45197ZM14.625 9.45197H16.125V16.952H14.625V9.45197ZM6.375 9.45197H7.875V16.952H6.375V9.45197ZM10.5 9.45197H12V16.952H10.5V9.45197Z"
              fill="white"
            />
          </svg>

          <h2 className="text-[16px] font-semibold text-white">Withdrawal details</h2>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-[14px] font-semibold text-[#A1A5AF]">Available balance:</span>
          <span className="text-[14px] font-semibold text-[#3B82F6]">
            {balanceLoading ? "..." : formatNgn(latestBalance)}
          </span>
        </div>

        {submitSuccess && (
          <div className="mt-4 rounded-[10px] bg-green-500/10 border border-green-500/20 px-4 py-3 text-[13px] text-green-400">
            {submitSuccess}
          </div>
        )}

        {submitError && (
          <div className="mt-4 rounded-[10px] bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400 hidden">
            {submitError}
          </div>
        )}

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          {/* Bank */}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-white/90">Bank name</span>
            <div ref={bankDropRef} className="relative">
              <button
                type="button"
                disabled={banksLoading}
                onClick={() => setBankDropOpen((o) => !o)}
                className="flex h-[42px] w-full items-center justify-between rounded-[10px] border border-[#2E2E3A] bg-[#20202C] px-3 text-[13px] font-medium text-white outline-none transition focus:border-[#3B82F6]/80 focus:ring-2 focus:ring-[#3B82F6]/25 disabled:opacity-50"
              >
                <span className={selectedBank ? "text-white" : "text-white/30"}>
                  {banksLoading ? "Loading banks..." : selectedBank ? selectedBank.name : "Select Bank Name"}
                </span>
                <svg className="h-4 w-4 shrink-0 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {bankDropOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-[10px] border border-[#2E2E3A] bg-[#1C1C28] shadow-xl">
                  <div className="p-2 border-b border-[#2E2E3A]">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search bank..."
                      value={bankQuery}
                      onChange={(e) => setBankQuery(e.target.value)}
                      className="w-full rounded-md bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none"
                    />
                  </div>
                  <ul className="max-h-[200px] overflow-y-auto py-1">
                    {filteredBanks.length === 0 ? (
                      <li className="px-4 py-3 text-[13px] text-white/40">No banks found</li>
                    ) : (
                      filteredBanks.map((b) => (
                        <li key={b.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBank(b);
                              setBankDropOpen(false);
                              setBankQuery("");
                            }}
                            className="w-full px-4 py-2 text-left text-[13px] text-white hover:bg-white/[0.06] transition-colors"
                          >
                            {b.name}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </label>

          {/* Account number */}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-white/90">Account Number</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="0123456789"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="h-[42px] w-full rounded-[10px] border border-[#2E2E3A] bg-[#20202C] px-3 text-[13px] font-medium text-white placeholder:text-white/30 outline-none transition focus:border-[#3B82F6]/80 focus:ring-2 focus:ring-[#3B82F6]/25"
            />
          </label>

          {/* Account name verification (only after 10 digits) */}
          {selectedBank && /^\d{10}$/.test(accountNumber) ? (
            <div className="rounded-[10px] border border-[#2E2E3A] bg-[#20202C] px-3 py-2">
              {verifyState === "checking" ? (
                <p className="text-[11px] font-semibold text-white/60 animate-pulse">Verifying account…</p>
              ) : verifyState === "error" ? (
                <p className="text-[11px] font-semibold text-red-400">{verifyError || "Account not found"}</p>
              ) : verifyState === "verified" ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-[#3A89FF] truncate">{accountName}</p>
                  <span className="shrink-0">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <g clipPath="url(#clip0_835_3182)">
                        <path
                          d="M6.82867 10.8758L4 8.04644L4.94267 7.10377L6.82867 8.98911L10.5993 5.21777L11.5427 6.16111L6.82867 10.8758Z"
                          fill="#3A89FF"
                        />
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M0.666687 7.99984C0.666687 3.94984 3.95002 0.666504 8.00002 0.666504C12.05 0.666504 15.3334 3.94984 15.3334 7.99984C15.3334 12.0498 12.05 15.3332 8.00002 15.3332C3.95002 15.3332 0.666687 12.0498 0.666687 7.99984ZM8.00002 13.9998C7.21209 13.9998 6.43187 13.8446 5.70392 13.5431C4.97597 13.2416 4.31453 12.7996 3.75738 12.2425C3.20023 11.6853 2.75827 11.0239 2.45674 10.2959C2.15521 9.56798 2.00002 8.78777 2.00002 7.99984C2.00002 7.21191 2.15521 6.43169 2.45674 5.70374C2.75827 4.97578 3.20023 4.31435 3.75738 3.7572C4.31453 3.20004 4.97597 2.75809 5.70392 2.45656C6.43187 2.15503 7.21209 1.99984 8.00002 1.99984C9.59132 1.99984 11.1174 2.63198 12.2427 3.7572C13.3679 4.88241 14 6.40854 14 7.99984C14 9.59114 13.3679 11.1173 12.2427 12.2425C11.1174 13.3677 9.59132 13.9998 8.00002 13.9998Z"
                          fill="#3A89FF"
                        />
                      </g>
                      <defs>
                        <clipPath id="clip0_835_3182">
                          <rect width="16" height="16" fill="white" />
                        </clipPath>
                      </defs>
                    </svg>
                  </span>
                </div>
              ) : (
                <p className="text-[11px] font-semibold text-white/30">Verifying account…</p>
              )}
            </div>
          ) : null}

          {/* Amount */}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-white/90">Amount (Naira)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="100 - 1,000,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              className="h-[42px] w-full rounded-[10px] border border-[#2E2E3A] bg-[#20202C] px-3 text-[13px] font-medium text-white placeholder:text-white/30 outline-none transition focus:border-[#3B82F6]/80 focus:ring-2 focus:ring-[#3B82F6]/25"
            />
            {amountError && (
              <span className="text-[12px] text-red-400">{amountError}</span>
            )}
          </label>

          {/* Narration */}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-white/90">Narration</span>
            <input
              type="text"
              placeholder="Narration (Optional)"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className="h-[42px] w-full rounded-[10px] border border-[#2E2E3A] bg-[#20202C] px-3 text-[13px] font-medium text-white placeholder:text-white/30 outline-none transition focus:border-[#3B82F6]/80 focus:ring-2 focus:ring-[#3B82F6]/25"
            />
          </label>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="mt-1 h-[44px] w-full rounded-[10px] bg-[#1D78FF] text-[14px] font-semibold text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Withdraw"}
          </button>

          
        </form>
      </div>

      {summaryOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-[520px] rounded-[18px] border border-[#2E2E3A] bg-[#0E0E16] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] sm:text-[20px] font-bold text-white">Withdrawal Summary</h2>
              <button
                type="button"
                onClick={() => {
                  setSummaryOpen(false);
                }}
                className="h-8 w-8 rounded-full border border-white/10 text-white/70 hover:bg-white/10"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-5">
              <p className="text-[12px] sm:text-[14px] text-white/70">Withdrawal amount</p>
              <div className="mt-2 rounded-[14px] bg-[#1D78FF] px-4 py-3 text-white">
                <div className="flex items-center justify-between text-[12px] sm:text-[14px]">
                  <span>Amount:</span>
                  <span className="font-semibold text-[12px] sm:text-[14px]">{formatNgn(amountNum)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[12px] sm:text-[14px]">
                  <span>Fees:</span>
                  <span className="font-semibold">
                    {feesLoading ? "..." : formatNgn(fee)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[12px] sm:text-[14px]">
                  <span>Total:</span>
                  <span className="font-semibold">{feesLoading ? "..." : formatNgn(totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-[12px] sm:text-[14px] text-white/70">Beneficiary Details</p>
              <div className="mt-2 rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-3 text-white">
                <div className="flex items-center justify-between text-[12px] sm:text-[14px]">
                  <span className="text-white/70">Bank Name :</span>
                  <span className="">{selectedBank?.name || "-"}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[12px] sm:text-[14px]">
                  <span className="text-white/70">Account Name :</span>
                  <span className="">{accountName || "-"}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[12px] sm:text-[14px]">
                  <span className="text-white/70">Account Number :</span>
                  <span className="">{accountNumber || "-"}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={feesLoading}
              onClick={() => {
                setSummaryOpen(false);
                setPinOpen(true);
                resetPinInputs();
                window.setTimeout(() => focusPinSlot(0), 0);
              }}
              className="mt-6 h-[43px] sm:h-[48px] w-full rounded-[12px] bg-[#1D78FF] text-[12px] sm:text-[14px] font-semibold text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirm Withdrawal
            </button>
          </div>
        </div>
      ) : null}

      {pinOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-[520px] rounded-[18px] border border-[#2E2E3A] bg-[#0E0E16] p-3 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] sm:text-[20px] font-bold text-white">Enter PIN</h2>
              <button
                type="button"
                onClick={() => {
                  setPinOpen(false);
                }}
                className="h-8 w-8 rounded-full border border-white/10 text-white/70 hover:bg-white/10"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className="mt-2 text-[13px] text-white/70">Enter your 4-digit PIN to confirm this withdrawal</p>

            <div className="mt-6 flex items-center justify-center gap-2">
              {pinSlots.map((value, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    pinInputsRef.current[index] = el;
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  type="password"
                  maxLength={1}
                  value={value}
                  onChange={(e) => handlePinChange(index, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(index, e)}
                  className="h-[44px] w-[44px] rounded-lg border border-white/10 bg-white/[0.06] text-center text-[18px] text-white outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                  aria-label={`PIN digit ${index + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              disabled={submitting || pinSlots.join("").length !== 4}
              onClick={async () => {
                const pin = pinSlots.join("");
                setPinOpen(false);
                const ok = await submitWithdrawalWithPin(pin);
                if (!ok) {
                  setPinOpen(true);
                  window.setTimeout(() => focusPinSlot(0), 0);
                }
              }}
              className="mt-6 h-[42px] sm:h-[48px] w-full rounded-[12px] bg-[#1D78FF] text-[14px] sm:text-[14px] font-semibold text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Processing..." : "Confirm"}
            </button>
          </div>
        </div>
      ) : null}

      {processingOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-[520px] rounded-[18px] border border-[#2E2E3A] bg-[#0E0E16] p-5 text-center">
            <h2 className="text-[14px] font-semibold text-white/90">Withdrawal Proceeded</h2>

            <div className="mx-auto mt-5 flex h-[64px] w-[64px] items-center justify-center rounded-full bg-[#0B2A55]">
              <div className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[#123E7A]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M7 17L17 7"
                    stroke="#7CB3FF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 7H17V15"
                    stroke="#7CB3FF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.03] p-4 text-left">
              <p className="text-[13px] font-semibold text-white">Withdrawal details</p>

              <div className="mt-4 grid gap-3 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Amount</span>
                  <span className="text-white">{formatNgn(submittedDetails?.amount ?? amountNum)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Bank Name</span>
                  <span className="text-white">{submittedDetails?.bankName ?? selectedBank?.name ?? "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Account Name</span>
                  <span className="text-white">{submittedDetails?.accountName ?? accountName ?? "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Fees</span>
                  <span className="text-white">{formatNgn(submittedDetails?.fee ?? fee)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Date</span>
                  <span className="text-white">{formatDate(submittedDetails?.createdAt ?? new Date().toISOString())}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Reference</span>
                  <div className="flex items-center gap-2">
                    <span className="max-w-[210px] truncate text-white" title={submittedDetails?.reference ?? ""}>
                      {submittedDetails?.reference ? shortReference(submittedDetails.reference) : "-"}
                    </span>
                    {submittedDetails?.reference ? (
                      <button
                        type="button"
                        onClick={() => copyReferenceToClipboard(submittedDetails.reference)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                        aria-label="Copy reference"
                        title="Copy reference"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M8 7C8 5.89543 8.89543 5 10 5H19C20.1046 5 21 5.89543 21 7V16C21 17.1046 20.1046 18 19 18H10C8.89543 18 8 17.1046 8 16V7Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M6 19C4.89543 19 4 18.1046 4 17V8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[10px] bg-black/30 px-3 py-2 text-[11px] text-white/60">
                Withdrawal is on its way to designated beneficiary, typically take less than 1min
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                closeAllModals();
                router.push("/dashboard");
              }}
              className="mt-8 h-[42px] sm:h-[48px] w-full rounded-[12px] bg-[#3B82F6] text-[12px] sm:text-[14px] font-semibold text-white transition hover:bg-[#2F76EC]"
            >
              Home
            </button>
          </div>
        </div>
      ) : null}

      {/* ── History ── */}
      <div className="hidden rounded-[12px] border border-[#2D2A3F] bg-[#16161E] p-6 h-[84vh] lg:flex flex-col">
        <h2 className="text-[18px] font-semibold text-white">Withdrawal History</h2>

        {withdrawals.length === 0 ? (
          <div className="mt-12 flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <svg className="h-10 w-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[14px] text-[#A1A5AF]">No withdrawals yet</p>
          </div>
        ) : (
          <div className="mt-4 flex-1 overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[460px] text-[13px]">
              <thead>
                <tr className="border-b border-[#2E2E3A] text-[#9597A3]">
                  <th className="pb-3 text-left font-medium">Bank / Account</th>
                  <th className="pb-3 text-right font-medium">Amount</th>
                  <th className="pb-3 text-center font-medium">Status</th>
                  <th className="pb-3 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-[#2E2E3A]/50 last:border-0">
                    <td className="py-[14px] pr-2">
                      <p className="font-medium text-white">{w.bank_name}</p>
                      <p className="text-[11px] text-[#A1A5AF]">
                        {maskAccount(w.account_number)} · {w.account_name}
                      </p>
                    </td>
                    <td className="py-[14px] text-right font-semibold text-white">
                      {formatNgn(w.amount)}
                    </td>
                    <td className="py-[14px] text-center">
                      <span
                        className={`inline-flex rounded-[10px] px-3 py-1 text-[11px] font-semibold capitalize ${STATUS_COLORS[w.status] ?? "bg-white/10 text-white/60"}`}
                      >
                        {STATUS_LABELS[w.status] ?? w.status}
                      </span>
                      {w.status === "failed" && w.failure_reason && (
                        <p className="mt-1 text-[10px] text-red-400/70 max-w-[120px] mx-auto truncate" title={w.failure_reason}>
                          {w.failure_reason}
                        </p>
                      )}
                    </td>
                    <td className="py-[14px] text-right text-[#A1A5AF]">
                      {formatDate(w.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
