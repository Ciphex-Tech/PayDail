import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import Sidebar from "@/app/dashboard/Sidebar";
import PageHeader from "@/app/dashboard/PageHeader";
import MobileBackHeader from "@/app/_components/MobileBackHeader";

export default async function PaydailIdWithdrawPage() {
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

  return (
    <div className="min-h-screen w-full bg-[#0B0A0F] text-white">
      <div className="flex min-h-screen">
        <Sidebar active="withdraw" />

        <main className="flex-1 flex h-screen flex-col overflow-hidden">
          <PageHeader title="Withdraw" fullName={fullName} email={email} />
          <MobileBackHeader title="" />

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-[520px] rounded-[16px] border border-[#2E2E3A] bg-[#16161E] p-6">
              <h2 className="text-[18px] font-semibold">PayDail ID</h2>
              <p className="mt-2 text-[13px] text-white/70">Coming soon.</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
