import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Sidebar from "@/app/dashboard/Sidebar";
import PageHeader from "@/app/dashboard/PageHeader";
import Link from "next/link";
import Image from "next/image";

export default async function WithdrawPage() {
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
    null;

  const first = typeof meta.first_name === "string" ? meta.first_name : "";
  const last = typeof meta.last_name === "string" ? meta.last_name : "";
  const fullName = fullNameFromMeta || `${first} ${last}`.trim() || user.email || "there";
  const email = user.email || "";

  const admin = createSupabaseAdminClient();

  const { data: userInfo } = await admin
    .from("users_info")
    .select("naira_balance")
    .eq("id", user.id)
    .maybeSingle();

  const nairaBalance = Number(userInfo?.naira_balance ?? 0);

  return (
    <div className="min-h-screen w-full bg-[#0B0A0F] text-white">
      <div className="flex min-h-screen">
        <Sidebar active="withdraw" />

        <main className="flex-1 flex h-screen flex-col">
          <PageHeader title="Withdraw" fullName={fullName} email={email} />

          <div className="flex-1 overflow-y-auto px-6 py-6 overflow-hidden overflow-x-hidden w-[100%] mx-auto">
            <div className="max-w-[520px]">
              <h1 className="text-[20px] font-semibold">Withdrawal</h1>
              <p className="mt-1 text-[13px] font-semibold text-[#9597A3]">
                Withdraw funds through your preferred medium
              </p>

              <div className="md:mt-6 md:rounded-[16px] md:border md:border-[#2E2E3A] md:bg-[#16161E] md:p-5">
                <p className="hidden md:block text-[18px] font-semibold text-white">Select withdrawal method</p>

                <div className="mt-4 grid gap-[20px]">
                  <Link
                    href="/withdraw/paydail-id"
                    className="flex items-center justify-between rounded-[12px] border border-[#2E2E3A] bg-[#20202C] p-3 md:px-4 md:py-4 hover:bg-white/5"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-[24px] w-[24px] items-center justify-center rounded-[12px]">
                        <Image src="/images/paydail_id.svg" alt="" width={24} height={24} />
                      </span>
                      <span>
                        <span className="block text-[14px] font-semibold">PayDail ID</span>
                        <span className="block text-[12px] font-semibold text-[#9597A3]">Send funds to PayDail users</span>
                      </span>
                    </span>

                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 18l6-6-6-6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>

                  <Link
                    href="/withdraw/bank-transfer"
                    className="flex items-center justify-between rounded-[12px] border border-[#2E2E3A] bg-[#20202C] p-3 md:px-4 md:py-4 hover:bg-white/5"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-[24px] w-[24px] items-center justify-center rounded-[12px]">
                        <Image src="/images/bank_transfer.svg" alt="" width={20} height={20} />
                      </span>
                      <span>
                        <span className="block text-[14px] font-semibold">Bank Transfer</span>
                        <span className="block text-[12px] font-semibold text-[#9597A3]">Send funds to bank accounts</span>
                      </span>
                    </span>

                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 18l6-6-6-6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>

                  <Link
                    href="/withdraw/crypto"
                    className="flex items-center justify-between rounded-[12px] border border-[#2E2E3A] bg-[#20202C] p-3 md:px-4 md:py-4 hover:bg-white/5"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-[24px] w-[24px] items-center justify-center rounded-[12px]">
                        <Image src="/images/crypto_transfer.svg" alt="" width={20} height={20} />
                      </span>
                      <span>
                        <span className="block text-[14px] font-semibold">Crypto withdrawal</span>
                        <span className="block text-[12px] font-semibold text-[#9597A3]">Send funds to crypto wallets</span>
                      </span>
                    </span>

                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 18l6-6-6-6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
