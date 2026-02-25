"use client";

import { useEffect, useRef } from "react";

export default function TopToast({
  open,
  message,
  variant = "error",
  onClose,
}: {
  open: boolean;
  message: string;
  variant?: "error" | "success";
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => onCloseRef.current(), 2000);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2 transition-transform duration-300 ${
        open ? "translate-y-0" : "-translate-y-24"
      }`}
      aria-hidden={!open}
    >
      <div className="flex flex-col items-center">
        <div
          className={`h-0 w-0 border-l-[10px] border-r-[10px] border-b-[12px] border-l-transparent border-r-transparent ${
            variant === "success" ? "border-b-[#16A34A]" : "border-b-[#E11D48]"
          }`}
        />
        <div
          className={`rounded-md px-4 py-2 text-sm font-medium text-white shadow-lg ${
            variant === "success" ? "bg-[#16A34A]" : "bg-[#E11D48]"
          }`}
        >
          {message}
        </div>
      </div>
    </div>
  );
}
