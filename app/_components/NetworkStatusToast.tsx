"use client";

import { useEffect, useRef, useState } from "react";

import TopToast from "@/app/_components/TopToast";
import { useNetworkStatus } from "@/lib/network/useNetworkStatus";

export default function NetworkStatusToast() {
  const { isOnline } = useNetworkStatus();
  const prevOnlineRef = useRef<boolean | null>(null);

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("No internet connection");
  const [variant, setVariant] = useState<"error" | "success">("error");

  useEffect(() => {
    const prev = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    if (prev === null) {
      if (!isOnline) {
        setVariant("error");
        setMessage("No internet connection");
        setOpen(true);
      }
      return;
    }

    if (prev && !isOnline) {
      setVariant("error");
      setMessage("No internet connection");
      setOpen(true);
      return;
    }

    if (!prev && isOnline) {
      setVariant("success");
      setMessage("Back online");
      setOpen(true);
    }
  }, [isOnline]);

  return <TopToast open={open} message={message} variant={variant} onClose={() => setOpen(false)} />;
}
