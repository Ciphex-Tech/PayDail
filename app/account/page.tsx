import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Sidebar from "@/app/dashboard/Sidebar";
import PageHeader from "@/app/dashboard/PageHeader";

export default async function AccountPage() {
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

  return (
    <div className="min-h-screen w-full bg-[#0B0A0F] text-white">
      <div className="flex min-h-screen">
        <Sidebar active="settings" />

        <main className="flex-1 flex h-screen flex-col overflow-hidden">
          <PageHeader title="Account" fullName={fullName} email={email} />

          <div className="flex-1 overflow-y-auto px-6 py-6 overflow-x-hidden w-[100%] max-w-[1300px] mx-auto">
            <section className="rounded-[12px] bg-[#16161E] border border-[#2D2A3F] p-6">
              <h2 className="text-[18px] font-medium">Account</h2>
              <p className="mt-2 text-[14px] text-white/60">Coming soon</p>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
