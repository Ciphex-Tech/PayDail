import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Sidebar from "@/app/dashboard/Sidebar";
import PageHeader from "@/app/dashboard/PageHeader";
import WithdrawContent from "@/app/withdraw/WithdrawContent";
import MobileBackHeader from "@/app/_components/MobileBackHeader";
import Image from "next/image";

export default async function BankTransferWithdrawPage() {
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

  const { data: withdrawals } = await admin
    .from("withdrawals")
    .select("id, reference, amount, bank_name, account_number, account_name, status, failure_reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="min-h-screen w-full bg-[#0B0A0F] text-white">
      <div className="flex min-h-screen">
        <Sidebar active="withdraw" />

        <main className="flex-1 flex h-screen flex-col">
          <PageHeader title="Withdraw" fullName={fullName} email={email} />
          <MobileBackHeader title="Bank Transfer" />

          <div className="flex-1 overflow-y-auto pb-[50px] p-6 md:px-6 md:py-6 overflow-hidden overflow-x-hidden w-[100%] mx-auto">
            <div className="mb-[20px] md:mb-[40px] flex items-center gap-2">
              <Image src="/images/bank_transfer.svg" alt="" width={16} height={16} />
              <h1 className="text-[18px] font-semibold text-white">Bank Transfer</h1>
            </div>
            <WithdrawContent nairaBalance={nairaBalance} initialWithdrawals={withdrawals ?? []} />
          </div>
        </main>
      </div>
    </div>
  );
}
