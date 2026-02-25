import { redirect } from "next/navigation";
import Sidebar from "@/app/dashboard/Sidebar";
import PageHeader from "@/app/dashboard/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/security/isAdminEmail";

type RegistrationRow = {
  id: string;
  email: string | null;
  created_at: string;
  email_confirmed_at?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export default async function AdminRegistrationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/login");
  }

  const user = data.user;
  const email = user.email || "";
  const isAdmin = isAdminEmail(email);

  if (!isAdmin) {
    redirect("/dashboard");
  }

  const admin = createSupabaseAdminClient();
  const { data: listData, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    console.error("/admin/registrations listUsers error", { message: listError.message });
  }

  const rows: RegistrationRow[] = (listData?.users ?? []) as any;

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

  return (
    <div className="min-h-screen w-full bg-[#0B0A0F] text-white">
      <div className="flex min-h-screen">
        <Sidebar active="registrations" isAdmin={isAdmin} />

        <main className="flex-1 flex h-screen flex-col overflow-hidden">
          <PageHeader title="Registrations" fullName={fullName} email={email} />

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <section className="rounded-[12px] bg-[#16161E] p-6 border border-[#2D2A3F]">
              <div className="flex items-center justify-between">
                <h2 className="text-[18px] font-medium text-white">All Registrations</h2>
                <p className="text-[13px] text-[#A1A5AF]">{rows.length.toLocaleString()} users</p>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-[14px]">
                  <thead className="text-[#A1A5AF]">
                    <tr className="border-b border-[#2D2A3F]">
                      <th className="py-3 pr-4 font-medium">Email</th>
                      <th className="py-3 pr-4 font-medium">Name</th>
                      <th className="py-3 pr-4 font-medium">Phone</th>
                      <th className="py-3 pr-4 font-medium">Created</th>
                      <th className="py-3 pr-0 font-medium">Confirmed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const m = (r.user_metadata ?? {}) as Record<string, unknown>;
                      const name =
                        (typeof m.full_name === "string" && m.full_name.trim()) ||
                        (typeof m.fullName === "string" && m.fullName.trim()) ||
                        (typeof m.name === "string" && m.name.trim()) ||
                        "-";

                      const createdLabel = r.created_at
                        ? new Date(r.created_at).toLocaleString()
                        : "-";

                      const confirmed = Boolean((r as any).email_confirmed_at || (r as any).confirmed_at);

                      return (
                        <tr key={r.id} className="border-b border-[#232032]">
                          <td className="py-4 pr-4 text-white/90">{r.email ?? "-"}</td>
                          <td className="py-4 pr-4 text-white/90">{name}</td>
                          <td className="py-4 pr-4 text-white/90">{(r as any).phone ?? "-"}</td>
                          <td className="py-4 pr-4 text-white/90">{createdLabel}</td>
                          <td className="py-4 pr-0">
                            <span
                              className={
                                confirmed
                                  ? "inline-flex rounded-full bg-emerald-500/20 px-3 py-1 text-[12px] font-medium text-emerald-300"
                                  : "inline-flex rounded-full bg-yellow-500/20 px-3 py-1 text-[12px] font-medium text-yellow-300"
                              }
                            >
                              {confirmed ? "Confirmed" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {listError ? (
                <p className="mt-4 text-[13px] text-red-300">
                  Failed to load registrations. Check server logs.
                </p>
              ) : null}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
