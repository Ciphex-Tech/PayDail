"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Bank = { id: number; name: string; code: string };

type Withdrawal = {
  id: string;
  reference: string;
  amount: number;
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

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

  const amountError = useMemo(() => {
    if (!amount) return "";
    if (!Number.isFinite(amountNum) || amountNum <= 0) return "Enter a valid amount";
    if (amountNum < 1000) return "Minimum withdrawal is ₦1,000";
    if (amountNum > latestBalance) return `Insufficient balance (₦${latestBalance.toLocaleString()})`;
    return "";
  }, [amount, amountNum, latestBalance]);

  const canSubmit =
    !submitting &&
    selectedBank !== null &&
    verifyState === "verified" &&
    accountName.trim().length > 0 &&
    amountNum >= 1000 &&
    amountNum <= latestBalance &&
    !amountError;

  useEffect(() => {
    setLatestBalance(nairaBalance);
  }, [nairaBalance]);

  useEffect(() => {
    setWithdrawals(initialWithdrawals);
    refreshedByRealtimeRef.current = false;
  }, [initialWithdrawals]);

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
    setSubmitError("");
    setSubmitSuccess("");

    await refreshBalance();

    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          bank_code: selectedBank!.code,
          bank_name: selectedBank!.name,
          account_number: accountNumber,
          account_name: accountName,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setSubmitError(json.error ?? "Failed to submit withdrawal");
        return;
      }

      const isReview = json.withdrawal?.status === "review_required";
      setSubmitSuccess(
        isReview
          ? "Withdrawal submitted. It requires admin review because it exceeds ₦100,000. You will be notified once approved."
          : "Withdrawal submitted successfully! It will be processed shortly.",
      );

      setAmount("");
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
        bank_name: selectedBank!.name,
        account_number: accountNumber,
        account_name: accountName,
        status: json.withdrawal.status,
        failure_reason: null,
        created_at: new Date().toISOString(),
      };
      setWithdrawals((prev) => [newWd, ...prev]);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      {/* ── Form ── */}
      <div className="rounded-[12px] border border-[#2D2A3F] bg-[#16161E] p-6">
        <h2 className="text-[18px] font-semibold text-white">Withdraw Naira</h2>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-[13px] text-[#A1A5AF]">Available balance:</span>
          <span className="text-[15px] font-semibold text-white">
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
            <span className="text-[13px] font-medium text-white">Bank</span>
            <div ref={bankDropRef} className="relative">
              <button
                type="button"
                disabled={banksLoading}
                onClick={() => setBankDropOpen((o) => !o)}
                className="flex h-[43px] w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30 disabled:opacity-50"
              >
                <span className={selectedBank ? "text-white" : "text-white/30"}>
                  {banksLoading ? "Loading banks..." : selectedBank ? selectedBank.name : "Select bank"}
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
            <span className="text-[13px] font-medium text-white">Account Number</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="0123456789"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="h-[43px] w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
            />
          </label>

          {/* Account name */}
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-white">Account Name</span>
            <div className="relative h-[43px]">
              <div className="flex h-full w-full items-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm">
                {verifyState === "checking" && (
                  <span className="text-white/40 animate-pulse">Verifying account…</span>
                )}
                {verifyState === "verified" && (
                  <span className="text-green-400 font-medium">{accountName}</span>
                )}
                {verifyState === "error" && (
                  <span className="text-red-400 text-[12px]">{verifyError}</span>
                )}
                {verifyState === "idle" && (
                  <span className="text-white/25">Auto-filled after verification</span>
                )}
              </div>
              {verifyState === "verified" && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Amount */}
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-white">Amount (₦)</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">₦</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className="h-[43px] w-full rounded-lg border border-white/10 bg-white/[0.06] pl-7 pr-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
              />
            </div>
            {amountError && (
              <span className="text-[12px] text-red-400">{amountError}</span>
            )}
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-1 h-[44px] w-full rounded-[10px] bg-[#1D78FF] text-[14px] font-semibold text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Withdraw"}
          </button>

          <p className="text-center text-[11px] text-[#A1A5AF]">
            Min ₦1,000 · Max 3 withdrawals per 24 hrs · Funds held until transfer completes
          </p>
        </form>
      </div>

      {/* ── History ── */}
      <div className="rounded-[12px] border border-[#2D2A3F] bg-[#16161E] p-6 h-[560px] flex flex-col">
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
