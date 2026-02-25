"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopToast from "@/app/_components/TopToast";

export default function LoginSuccessToast() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("Login successful");
  const [variant, setVariant] = useState<"success" | "error">("success");

  useEffect(() => {
    const toast = searchParams.get("toast");
    if (toast === "login_success") {
      setMessage("Login successful");
      setVariant("success");
      setOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("toast");
      const qs = next.toString();
      router.replace(qs ? `/dashboard?${qs}` : "/dashboard");
    }
  }, [router, searchParams]);

  useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent<{ message?: string; variant?: "success" | "error" }>;
      const nextMessage = ce.detail?.message;
      if (!nextMessage) return;
      setMessage(nextMessage);
      setVariant(ce.detail?.variant || "success");
      setOpen(true);
    }

    window.addEventListener("paydail:toast", onToast);
    return () => window.removeEventListener("paydail:toast", onToast);
  }, []);

  return (
    <TopToast
      open={open}
      variant={variant}
      message={message}
      onClose={() => setOpen(false)}
    />
  );
}
