import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LoginSuccessToast from "@/app/dashboard/LoginSuccessToast";
import TotalBalanceCard from "@/app/dashboard/TotalBalanceCard";
import CopyableAddress from "@/app/dashboard/CopyableAddress";
import Sidebar from "@/app/dashboard/Sidebar";
import PageHeader from "@/app/dashboard/PageHeader";
import Image from "next/image";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/login");
  }

  const user = data.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const fullNameFromMeta =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.fullName === "string" && meta.fullName.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    null;

  const first = typeof meta.firstName === "string" ? meta.firstName : "";
  const last = typeof meta.lastName === "string" ? meta.lastName : "";
  const combined = `${first} ${last}`.trim();

  const fullName = fullNameFromMeta || combined || user.email || "there";

  const email = user.email || "";

  const { data: info } = await supabase
    .from("users_info")
    .select("naira_balance")
    .eq("id", user.id)
    .maybeSingle();

  const nairaBalance = Number(info?.naira_balance ?? 0);

  const { data: lastDeposit } = await supabase
    .from("deposits")
    .select("naira_amount, created_at")
    .eq("user_id", user.id)
    .eq("type", "Deposit")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastDepositNaira = Number((lastDeposit as any)?.naira_amount ?? 0);
  const prevBalance = nairaBalance - (Number.isFinite(lastDepositNaira) ? lastDepositNaira : 0);
  const pctIncrease =
    Number.isFinite(lastDepositNaira) && lastDepositNaira > 0
      ? prevBalance > 0
        ? (lastDepositNaira / prevBalance) * 100
        : 100
      : 0;

  const lastUpdatedLabel = lastDeposit?.created_at
    ? `Last updated ${new Date(lastDeposit.created_at).toLocaleString()}`
    : "Last updated -";

  const { data: recentDeposits } = await supabase
    .from("deposits")
    .select("id, reference, type, naira_amount, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: recentWithdrawals } = await supabase
    .from("withdrawals")
    .select("id, reference, amount, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  type RecentTxn = {
    id: string;
    reference: string | null;
    kind: "deposit" | "withdrawal";
    amountNgn: number;
    status: string;
    created_at: string;
  };

  const txns: RecentTxn[] = [
    ...((recentDeposits as any[]) ?? []).map((d) => ({
      id: String(d.id),
      reference: (d.reference as string | null) ?? null,
      kind: "deposit" as const,
      amountNgn: Number(d.naira_amount ?? 0),
      status: String(d.status ?? "completed"),
      created_at: String(d.created_at),
    })),
    ...((recentWithdrawals as any[]) ?? []).map((w) => ({
      id: String(w.id),
      reference: (w.reference as string | null) ?? null,
      kind: "withdrawal" as const,
      amountNgn: Number(w.amount ?? 0),
      status: String(w.status ?? "pending"),
      created_at: String(w.created_at),
    })),
  ]
    .sort((a, b) => {
      const aa = new Date(a.created_at).getTime();
      const bb = new Date(b.created_at).getTime();
      return bb - aa;
    })
    .slice(0, 5);

  const formatTxnDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
    } catch {
      return "-";
    }
  };

  const statusPill = (s: string) => {
    const v = String(s || "").toLowerCase();
    if (v === "completed" || v === "success" || v === "successful") {
      return "bg-[#00A82D1A] text-[#00A82D]";
    }
    if (v === "failed" || v === "reversed") {
      return "bg-red-500/10 text-red-400";
    }
    if (v === "review_required" || v === "approved") {
      return "bg-yellow-500/10 text-yellow-300";
    }
    return "bg-white/10 text-white/60";
  };

  const shortReference = (kind: "deposit" | "withdrawal", reference: string | null) => {
    const ref = (reference ?? "").trim();
    if (!ref) return "-";
    if (kind !== "withdrawal") return ref;

    if (ref.length <= 8) return ref;
    const tail = ref.slice(-3);
    return `WD...${tail}`;
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0A0F] text-white">
      <LoginSuccessToast />

      <div className="flex min-h-screen">
        <Sidebar active="dashboard" />

        <main className="flex-1 flex h-screen flex-col overflow-hidden">
          <PageHeader title="Dashboard" fullName={fullName} email={email} />

          <div className="flex-1 overflow-y-auto px-6 py-6 overflow-x-hidden w-[100%] max-w-[1300px] mx-auto">
            <div className="grid gap-6 lg:grid-cols-2">
              <TotalBalanceCard
                nairaBalance={Number.isFinite(nairaBalance) ? nairaBalance : 0}
                percentIncrease={Number.isFinite(pctIncrease) ? pctIncrease : 0}
                lastUpdatedLabel={lastUpdatedLabel}
              />

              <section className="rounded-[12px] bg-[#16161E] p-6 border border-[#2D2A3F]">
                <p className="text-[14px] text-[#A1A5AF]">Frequent Address USDT (Trc 20)</p>
                <CopyableAddress address="0x734d...84c" />
                <div className="mt-[40px] sm:mt-[70px] grid gap-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#A1A5AF] text-[14px]">Last deposit</span>
                    <span className="font-semibold text-[14px] text/white">1,230 USDT</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#A1A5AF] text-[14px]">Last Withdrawal</span>
                    <span className="font-semibold text-[14px] text/white">750,920 Naira</span>
                  </div>
                </div>
              </section>
            </div>

            <section className="mt-[30px] sm:mt-[50px]">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] sm:text-[18px] font-medium text-white">Quick Services</h2>
              </div>

              <div className="mt-[20px] sm:mt-[25px] grid grid-cols-4 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 rounded-[12px] px-2 p-6 sm:p-none bg-[#16161E] sm:bg-transparent">
                <div className="rounded-[12px] bg-none sm:bg-[#16161E] sm:p-[18px] sm:pb-[13px] text-center sm:text-left">
                  <div className="mx-auto sm:mx-0 flex h-[36px] w-[36px] items-center justify-center rounded-[12px] bg-[#1A2135] sm:h-[45px] sm:w-[45px]">
                    <Image src="/images/tv.svg" alt="" width={22} height={22} />
                  </div>
                  <p className="mt-2 sm:mt-4 text-[10px] font-semibold sm:mt-10 sm:text-[14px]">Tv</p>
                </div>
                <div className="rounded-[12px] bg-none sm:bg-[#16161E] sm:p-[18px] sm:pb-[13px] text-center sm:text-left">
                  <div className="mx-auto sm:mx-0 flex h-[36px] w-[36px] items-center justify-center rounded-[12px] bg-[#182825] sm:h-[45px] sm:w-[45px]">
                    <Image src="/images/electricity.svg" alt="" width={18} height={18} />
                  </div>
                  <p className="mt-2 sm:mt-4 text-[10px] font-semibold sm:mt-10 sm:text-[14px]">Electricity</p>
                </div>
                <div className="rounded-[12px] bg-none sm:bg-[#16161E] sm:p-[18px] sm:pb-[13px] text-center sm:text-left">
                  <div className="mx-auto sm:mx-0 flex h-[36px] w-[36px] items-center justify-center rounded-[12px] bg-[#2A261D] sm:h-[45px] sm:w-[45px]">
                    <Image src="/images/airtime.svg" alt="" width={17} height={17} />
                  </div>
                  <p className="mt-2 sm:mt-4 text-[10px] font-semibold sm:mt-10 sm:text-[14px]">Airtime</p>
                </div>
                <div className="rounded-[12px] bg-none sm:bg-[#16161E] sm:p-[18px] sm:pb-[13px] text-center sm:text-left">
                  <div className="mx-auto sm:mx-0 flex h-[36px] w-[36px] items-center justify-center rounded-[12px] bg-[#2E1A25] sm:h-[45px] sm:w-[45px]">
                    <Image src="/images/data.svg" alt="" width={20} height={20} />
                  </div>
                  <p className="mt-2 sm:mt-4 text-[10px] font-semibold sm:mt-10 sm:text-[14px]">Data</p>
                </div>
              </div>
            </section>

            <section className="mt-[30px] sm:mt-[50px]">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] sm:text-[18px] font-medium text-white">Recent Transactions</h2>
                <Link href="#" className="text-[13px] sm:text-[14px] font-medium text-white hover:text-white/70">
                  View all
                </Link>
              </div>

              <div className="mt-4 sm:hidden">
                <div className="space-y-3">
                  {txns.map((t) => {
                    const title = t.kind === "deposit" ? "Deposit" : "Withdrawal";
                    const iconSrc = t.kind === "deposit" ? "/images/deposit.svg" : "/images/widthdrawal-notifications.svg";
                    const amountPrefix = t.kind === "deposit" ? "+" : "-";
                    const rightColor = t.kind === "deposit" ? "text-[#00FF44]" : "text-white";

                    return (
                      <div
                        key={`${t.kind}-${t.id}`}
                        className="rounded-[12px] border border-[#2B2A3A] bg-[#16161E] px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center">
                              <Image src={iconSrc} width={30} height={30} alt="" />
                            </div>
                            <div>
                              <p className="text-[14px] font-semibold text-white">{title}</p>
                              <p className="text-[11px] text-[#A1A5AF]">
                                {(t.reference ?? "-").slice(0, 12)} · {formatTxnDate(t.created_at)}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className={`text-[12px] font-semibold ${rightColor}`}>
                              {amountPrefix}₦{Number(t.amountNgn).toLocaleString()}
                            </p>
                            <span
                              className={`mt-1 inline-flex px-3 py-1 text-[10px] font-semibold capitalize ${statusPill(
                                t.status,
                              )}`}
                            >
                              {t.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {txns.length === 0 && (
                    <div className="rounded-[12px] border border-[#2B2A3A] bg-[#16161E] px-4 py-6 text-center text-[13px] text-[#A1A5AF]">
                      No recent transactions
                    </div>
                  )}
                </div>
              </div>

              <div
                className="mt-4 hidden sm:block overflow-hidden rounded-[12px] border border-[#2B2A3A]"
                style={{ borderBottom: "none" }}
              >
                <div className="grid grid-cols-5 gap-3 px-[24px] py-[24px] text-[14px] text-[#9597A3] bg-[#20202C]">
                  <div>Reference</div>
                  <div>Type</div>
                  <div>Amount</div>
                  <div>Status</div>
                  <div>Date</div>
                </div>
                <div className="h-px bg-white/10" />
                {txns.map((t) => (
                  <div
                    key={`${t.kind}-${t.id}`}
                    className="grid grid-cols-5 gap-3 px-5 py-4 text-[12px] border-b-1 border-[#2E2E3A] items-center"
                  >
                    <div className="font-semibold text-[14px] gap-[10px] flex items-center">
                      <div
                        className={`w-[30px] h-[30px] rounded-[12px] items-center justify-center flex ${
                          t.kind === "deposit" ? "bg-[#00A82D1A]" : "bg-[#1E7BFF1A]"
                        }`}
                      >
                        <Image
                          src={t.kind === "deposit" ? "/images/deposit.svg" : "/images/withdraw.svg"}
                          width={12}
                          height={12}
                          alt=""
                        />
                      </div>
                      <span>{shortReference(t.kind, t.reference)}</span>
                    </div>
                    <div className="font-medium text-[14px]">
                      {t.kind === "deposit" ? "Deposit" : "Withdrawal"}
                    </div>
                    <div>
                      <p className="font-semibold text-[14px]">
                        {t.kind === "deposit" ? "+" : "-"}₦{Number(t.amountNgn).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <span
                        className={`inline-flex rounded-[12px] px-3 py-1 text-[12px] font-semibold capitalize ${statusPill(
                          t.status,
                        )}`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div className="text-[#9AA2AC] text-[14px]">{formatTxnDate(t.created_at)}</div>
                  </div>
                ))}

                {txns.length === 0 && (
                  <div className="px-5 py-6 text-[13px] text-[#A1A5AF]">No recent transactions</div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
