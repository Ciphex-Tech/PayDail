"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function PageHeader({
  title,
  fullName,
  email,
}: {
  title: string;
  fullName: string;
  email: string;
}) {
  const [hasUnread, setHasUnread] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const mountedRef = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsNavigating(false);
  }, [pathname]);

  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      const hrefAttr = anchor.getAttribute("href") || "";
      if (!hrefAttr) return;
      if (hrefAttr.startsWith("#")) return;
      if (hrefAttr.startsWith("http://") || hrefAttr.startsWith("https://")) return;
      if (anchor.target && anchor.target !== "_self") return;

      setIsNavigating(true);
    }

    document.addEventListener("click", onDocumentClick, true);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const supabase = createSupabaseBrowserClient();

    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function refreshUnread(userId: string) {
      const { data } = await supabase
        .from("users_info")
        .select("unread_notifications")
        .eq("id", userId)
        .maybeSingle();

      if (!mountedRef.current) return;
      const unread = Number((data as any)?.unread_notifications ?? 0);
      setHasUnread(Boolean(Number.isFinite(unread) && unread > 0));
    }

    async function init() {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) {
        setHasUnread(false);
        return;
      }

      await refreshUnread(userId);

      channel = supabase
        .channel(`notifications-unread-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "users_info",
            filter: `id=eq.${userId}`,
          },
          () => {
            refreshUnread(userId);
          },
        )
        .subscribe();
    }

    init();

    return () => {
      mountedRef.current = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 relative flex min-h-[64px] items-center justify-between border-b border-[#2E2E3A] px-4 py-2 sm:px-[36px] sm:py-[15px] bg-[#16161E]">
      <div className="flex items-center gap-3">
        <div className="md:hidden">
          <Image src="/images/logo.svg" alt="PayDail" width={115} height={26} />
        </div>
        <h1 className="hidden text-[18px] font-medium text-white md:block">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/notifications"
          className="relative inline-flex h-[38px] w-[38px] items-center justify-center cursor-pointer"
          aria-label="Notifications"
        >
          <Image src="/images/notification.svg" alt="" width={25} height={25} className="w-[22px] h-[22px] sm:w-[25px] sm:h-[25px]" />
          {hasUnread ? (
            <span className="absolute right-[2px] top-[3px] h-[8px] w-[8px] rounded-full bg-[#E11D48]" />
          ) : null}
        </Link>

        <div className="hidden md:flex items-center gap-3 px-3 py-2 cursor-pointer border-l-1 border-[#2E2E3A]">
          <div className="relative w-[35px] h-[35px] sm:w-[40px] sm:h-[40px] pt-[5px] overflow-hidden rounded-full bg-[#1A2135]">
            <Image src="/images/user.png" alt="" width={40} height={40} className="w-[35px] h-[35px] sm:w-[40px] sm:h-[40px]" />
          </div>
          <div className="hidden md:block">
            <p className="text-[14px] font-medium leading-tight">{fullName}</p>
            <p className="text-[12px] font-light mt-[5px] text-[#A0A3AC] leading-tight">{email}</p>
          </div>
        </div>
      </div>

      {isNavigating ? <div className="paydail-toploader" /> : null}
    </header>
  );
}
