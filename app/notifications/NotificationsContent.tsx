"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  read: boolean;
  status: string | null;
  created_at: string;
};

function iconForType(typeRaw: string) {
  const type = (typeRaw || "").toLowerCase();
  if (type.includes("deposit_pending") || (type.includes("deposit") && type.includes("pending"))) {
    return "/images/depositpending-notifications.svg";
  }
  if (type.includes("deposit")) return "/images/deposit-notifications.svg";
  if (type.includes("withdrawal_failed")) return "/images/withdrwalfailed-notifications.svg";
  if (type.includes("withdrawal")) return "/images/widthdrawal-notifications.svg";
  if (type.includes("kyc")) return "/images/kyc-notifications.svg";
  if (type.includes("rates")) return "/images/rates-notifications.svg";
  if (type.includes("settings") || type.includes("security")) return "/images/settings-notifications.svg";
  return "/images/settings-notifications.svg";
}

function timeAgoLabel(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function NotificationsContent({
  initialNotifications,
  initialPrefs,
}: {
  initialNotifications: NotificationRow[];
  initialPrefs: {
    notify_rate: boolean;
    notify_transactions: boolean;
  };
}) {
  const [items, setItems] = useState<NotificationRow[]>(initialNotifications);
  const [prefs, setPrefs] = useState({
    notify_rate: initialPrefs.notify_rate,
    notify_transactions: initialPrefs.notify_transactions,
  });
  const [userId, setUserId] = useState<string | null>(null);
  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id ?? null);
    });
  }, []);

  async function markAsRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    } catch {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)));
    }
  }

  async function persistPrefs(patch: Partial<typeof prefs>) {
    if (!userId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("users_info").update(patch).eq("id", userId);
  }

  function Toggle({
    checked,
    onCheckedChange,
    label,
  }: {
    checked: boolean;
    onCheckedChange: (next: boolean) => void;
    label: string;
  }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onCheckedChange(!checked)}
        className={
          "relative inline-flex h-[19px] w-[37px] items-center rounded-full border duration-300 ease-in-out transition-all cursor-pointer " +
          (checked ? "bg-[#3B82F6] border-[#3B82F6]" : "bg-[#2D2A3F] border-[#2D2A3F]")
        }
      >
        <span
          className={
            "inline-block h-[13px] w-[13px] rounded-full bg-white transition-all duration-300 ease-in-out " +
            (checked ? "translate-x-[20px]" : "translate-x-[4px]")
          }
        />
      </button>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="mb-4">
          <h2 className="text-[18px] font-medium text-white">Notifications</h2>
          <p className="text-[13px] text-[#A1A5AF]">Stay updated with your account activity</p>
        </div>

        <div className="rounded-[12px] bg-[#16161E] border border-[#2D2A3F] p-4">
          {items.length === 0 ? (
            <div className="px-2 py-8 text-[14px] text-[#9AA2AC] text-center">No notifications yet.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((n) => {
                const icon = iconForType(n.notification_type);
                const isUnread = !n.read;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markAsRead(n.id)}
                    className={
                      "w-full text-left rounded-[12px] border p-4 transition-all " +
                      (isUnread
                        ? "border-[#3B82F6] bg-[#101727]"
                        : "border-[#2D2A3F] bg-[#1A1A25]")
                    }
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex items-center justify-center">
                        <Image src={icon} alt="" width={32} height={32} />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[14px] font-semibold text-white">{n.title}</p>
                          {isUnread ? <span className="mt-1 h-[8px] w-[8px] rounded-full bg-[#3B82F6]" /> : null}
                        </div>
                        <p className="mt-1 text-[12px] text-[#A1A5AF]">{n.message}</p>
                        <p className="mt-2 text-[11px] text-[#707381]">{timeAgoLabel(n.created_at)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="lg:col-span-1">
        <section className="rounded-[12px] bg-[#16161E] border border-[#2D2A3F] p-5">
          <h3 className="text-[16px] font-semibold">Notification preferences</h3>
          <p className="mt-1 text-[12px] text-[#A1A5AF]">Unread: {unreadCount}</p>

          <div className="mt-6 grid gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[14px] text-white">Rates Update</p>
              <Toggle
                checked={prefs.notify_rate}
                onCheckedChange={(next) => {
                  setPrefs((p) => ({ ...p, notify_rate: next }));
                  persistPrefs({ notify_rate: next });
                }}
                label="Rates Update"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[14px] text-white">Security alert</p>
              <Toggle checked={false} onCheckedChange={() => {}} label="Security alert" />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[14px] text-white">Transactions</p>
              <Toggle
                checked={prefs.notify_transactions}
                onCheckedChange={(next) => {
                  setPrefs((p) => ({ ...p, notify_transactions: next }));
                  persistPrefs({ notify_transactions: next });
                }}
                label="Transactions"
              />
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[12px] bg-[#16161E] border border-[#2D2A3F] p-5">
          <h3 className="text-[14px] font-semibold">Need help ?</h3>
          <p className="mt-1 text-[12px] text-[#A1A5AF]">Our support team is available to assist you 24/7</p>
          <button
            type="button"
            className="mt-4 w-full rounded-[10px] bg-[#3B82F6] px-4 py-3 text-[13px] font-semibold"
          >
            Contact Support
          </button>
        </section>
      </aside>
    </div>
  );
}
