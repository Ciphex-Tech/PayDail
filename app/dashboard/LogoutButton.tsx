"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Image from "next/image";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={loading}
      className="text-[16px] flex gap-3 text-[#9AA2AC] cursor-pointer font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Image 
      src="/images/logout-icon.svg"
      alt="Logout"
      width={18}
      height={18}
      />
      {loading ? "Logging out..." : "Logout"}
    </button>
  );
}
