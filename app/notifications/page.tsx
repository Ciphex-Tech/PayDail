import { redirect } from "next/navigation";
import Sidebar from "@/app/dashboard/Sidebar";
import PageHeader from "@/app/dashboard/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationsContent from "@/app/notifications/NotificationsContent";
import { isAdminEmail } from "@/lib/security/isAdminEmail";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  read: boolean;
  status: string | null;
  created_at: string;
};

type NotificationPrefs = {
  notify_rate: boolean;
  notify_transactions: boolean;
};

export default async function NotificationsPage() {
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

  const { data: prefsRow } = await supabase
    .from("users_info")
    .select("notify_rate, notify_transactions")
    .eq("id", user.id)
    .maybeSingle();

  const initialPrefs: NotificationPrefs = {
    notify_rate: Boolean((prefsRow as any)?.notify_rate ?? true),
    notify_transactions: Boolean((prefsRow as any)?.notify_transactions ?? true),
  };

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, title, message, notification_type, read, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="min-h-screen w-full bg-[#0B0A0F] text-white">
      <div className="flex min-h-screen">
        <Sidebar active="notifications" isAdmin={isAdmin} />

        <main className="flex-1 flex h-screen flex-col overflow-hidden">
          <PageHeader title="Notifications" fullName={fullName} email={email} />

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <NotificationsContent
              initialNotifications={((rows as NotificationRow[]) || [])}
              initialPrefs={initialPrefs}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
