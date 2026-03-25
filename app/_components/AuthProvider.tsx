"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useNetworkStatus } from "@/lib/network/useNetworkStatus";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
];

export default function AuthProvider() {
  const router = useRouter();
  const pathname = usePathname();
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        if (!isOnline) return;
        const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
        if (!isPublic) {
          router.replace("/login");
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!isOnline) return;
    router.refresh();
  }, [isOnline, router]);

  return null;
}
