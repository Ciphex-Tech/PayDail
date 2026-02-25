import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LoginSuccessToast from "@/app/dashboard/LoginSuccessToast";
import TotalBalanceCard from "@/app/dashboard/TotalBalanceCard";
import CopyableAddress from "@/app/dashboard/CopyableAddress";
import Sidebar from "@/app/dashboard/Sidebar";
import PageHeader from "@/app/dashboard/PageHeader";
import { isAdminEmail } from "@/lib/security/isAdminEmail";
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
  const isAdmin = isAdminEmail(email);

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

  return (
    <div className="min-h-screen w-full bg-[#0B0A0F] text-white">
      <LoginSuccessToast />

      <div className="flex min-h-screen">
        <Sidebar active="dashboard" isAdmin={isAdmin} />

        <main className="flex-1 flex h-screen flex-col overflow-hidden">
          <PageHeader title="Dashboard" fullName={fullName} email={email} />

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <TotalBalanceCard
                nairaBalance={Number.isFinite(nairaBalance) ? nairaBalance : 0}
                percentIncrease={Number.isFinite(pctIncrease) ? pctIncrease : 0}
                lastUpdatedLabel={lastUpdatedLabel}
              />

              <section className="rounded-[12px] bg-[#16161E] p-6 border border-[#2D2A3F]">
                <p className="text-[14px] text-[#A1A5AF]">Frequent Address USDT (Trc 20)</p>
                <CopyableAddress address="0x734d...84c" />
                <div className="mt-[70px] grid gap-3">
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

            <section className="mt-[50px]">
              <div className="flex items-center justify-between">
                <h2 className="text-[18px] font-medium text-white">Quick Services</h2>
              </div>

              <div className="mt-[25px] grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[12px] bg-[#16161E] p-[18px] pb-[13px]">
                  <div className="flex h-[45px] w-[45px] items-center justify-center rounded-[12px] bg-[#1A2135]">
                    <Image src="/images/tv.svg" alt="" width={22} height={22} />
                  </div>
                  <p className="mt-10 text-[14px] font-semibold">Tv Subscription</p>
                </div>
                <div className="rounded-[12px] bg-[#16161E] p-[18px] pb-[13px]">
                  <div className="flex h-[45px] w-[45px] items-center justify-center rounded-[12px] bg-[#182825]">
                    <Image src="/images/electricity.svg" alt="" width={18} height={18} />
                  </div>
                  <p className="mt-10 text-[14px] font-semibold">Electricity</p>
                </div>
                <div className="rounded-[12px] bg-[#16161E] p-[18px] pb-[13px]">
                  <div className="flex h-[45px] w-[45px] items-center justify-center rounded-[12px] bg-[#2A261D]">
                    <Image src="/images/airtime.svg" alt="" width={17} height={17} />
                  </div>
                  <p className="mt-10 text-[14px] font-semibold">Airtime</p>
                </div>
                <div className="rounded-[12px] bg-[#16161E] p-[18px] pb-[13px]">
                  <div className="flex h-[45px] w-[45px] items-center justify-center rounded-[12px] bg-[#2E1A25]">
                    <Image src="/images/data.svg" alt="" width={20} height={20} />
                  </div>
                  <p className="mt-10 text-[14px] font-semibold">Data</p>
                </div>
              </div>
            </section>

            <section className="mt-[50px]">
              <div className="flex items-center justify-between">
                <h2 className="text-[18px] font-medium text-white">Recent Transactions</h2>
                <Link href="#" className="text-[14px] font-medium text-white hover:text-white/70">
                  View all
                </Link>
              </div>

              <div className="mt-4 overflow-hidden rounded-[12px] border border-[#2B2A3A]" style={{
                borderBottom: "none"
              }}>
                <div className="grid grid-cols-5 gap-3 px-[24px] py-[24px] text-[14px] text-[#9597A3] bg-[#20202C]">
                  <div>Reference</div>
                  <div>Type</div>
                  <div>Amount</div>
                  <div>Status</div>
                  <div>Date</div>
                </div>
                <div className="h-px bg-white/10" />
                {[0, 1].map((i) => (
                  <div key={i} className="grid grid-cols-5 gap-3 px-5 py-4 text-[12px] border-b-1 border-[#2E2E3A] items-center">
                    <div className="font-semibold text-[14px] gap-[10px] flex items-center">
                      <div className="w-[30px] h-[30px] rounded-[12px] items-center justify-center flex bg-[#00A82D1A]">
                        <Image 
                        src="/images/deposit.svg"
                        width={12}
                        height={12}
                        alt=""
                        />
                      </div>
                     <span>TXN001</span> 
                      </div>
                    <div className="font-medium text-[14px]">{i === 0 ? "Deposit" : "Withdrawal"}</div>
                    <div>
                      <p className="font-semibold text-[14px]">100.00</p>
                      <p className="text-[12px] text-white/60">₦164,500.00</p>
                    </div>
                    <div>
                      <span className="inline-flex rounded-[12px] bg-[#00A82D1A] px-3 py-1 text-[12px] font-semibold text-[#00A82D]">
                        completed
                      </span>
                    </div>
                    <div className="text-[#9AA2AC] text-[14px]">Jan 06, 2026</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
