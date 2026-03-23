"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password"];

type Stage = "create" | "confirm" | "saving";

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

export default function PinGate() {
  const pathname = usePathname();

  const [checking, setChecking] = useState(true);
  const [mustSetPin, setMustSetPin] = useState(false);

  const [stage, setStage] = useState<Stage>("create");
  const [pinSlots, setPinSlots] = useState<string[]>(["", "", "", ""]);
  const [confirmSlots, setConfirmSlots] = useState<string[]>(["", "", "", ""]);
  const [createdPin, setCreatedPin] = useState<string>("");
  const [error, setError] = useState<string>("");

  const pinInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const confirmInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const pin = useMemo(() => pinSlots.join(""), [pinSlots]);
  const confirmPin = useMemo(() => confirmSlots.join(""), [confirmSlots]);

  useBodyScrollLock(mustSetPin);

  async function checkPinStatus(canceledRef?: { canceled: boolean }) {
    setChecking(true);
    setMustSetPin(false);

    if (isPublicPath(pathname)) {
      setChecking(false);
      return;
    }

    try {
      const res = await fetch("/api/pin/status", { method: "GET", cache: "no-store" });
      const raw = await res.text();
      let json: { ok?: boolean; has_pin?: boolean } = {};
      try {
        json = raw ? (JSON.parse(raw) as any) : {};
      } catch {
        // ignore
      }

      if (canceledRef?.canceled) return;

      if (res.status === 401) {
        setMustSetPin(false);
        return;
      }

      const hasPin = Boolean(res.ok && json.ok && json.has_pin);
      setMustSetPin(!hasPin);
      if (!hasPin) {
        setStage("create");
        setPinSlots(["", "", "", ""]);
        setConfirmSlots(["", "", "", ""]);
        setCreatedPin("");
        setError("");
      }
    } catch {
      if (canceledRef?.canceled) return;
      setMustSetPin(true);
    } finally {
      if (!canceledRef?.canceled) setChecking(false);
    }
  }

  useEffect(() => {
    const canceledRef = { canceled: false };
    checkPinStatus(canceledRef);
    return () => {
      canceledRef.canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange(() => {
      checkPinStatus();
    });
    return () => {
      data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function forceOpen() {
      setMustSetPin(true);
      setStage("create");
      setPinSlots(["", "", "", ""]);
      setConfirmSlots(["", "", "", ""]);
      setCreatedPin("");
      setError("");
    }

    window.addEventListener("paydail:open-pin-gate", forceOpen);
    return () => {
      window.removeEventListener("paydail:open-pin-gate", forceOpen);
    };
  }, []);

  useEffect(() => {
    if (!mustSetPin) return;
    if (stage === "create") {
      pinInputsRef.current[0]?.focus();
    }
    if (stage === "confirm") {
      confirmInputsRef.current[0]?.focus();
    }
  }, [mustSetPin, stage]);

  function focusSlot(ref: React.MutableRefObject<Array<HTMLInputElement | null>>, index: number) {
    ref.current[index]?.focus();
    ref.current[index]?.select();
  }

  function handleSlotChange(
    ref: React.MutableRefObject<Array<HTMLInputElement | null>>,
    slots: string[],
    setSlots: (v: string[]) => void,
    index: number,
    raw: string,
  ) {
    setError("");
    const digits = raw.replace(/\D/g, "");

    if (digits.length === 0) {
      const next = [...slots];
      next[index] = "";
      setSlots(next);
      return;
    }

    if (digits.length > 1) {
      const next = [...slots];
      let cursor = index;
      for (const ch of digits) {
        if (cursor > 3) break;
        next[cursor] = ch;
        cursor += 1;
      }
      setSlots(next);
      focusSlot(ref, Math.min(index + digits.length, 4) - 1);
      if (index + digits.length <= 3) focusSlot(ref, index + digits.length);
      return;
    }

    const next = [...slots];
    next[index] = digits;
    setSlots(next);

    if (index < 3) focusSlot(ref, index + 1);
  }

  function handleSlotKeyDown(
    ref: React.MutableRefObject<Array<HTMLInputElement | null>>,
    slots: string[],
    setSlots: (v: string[]) => void,
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace") {
      if (slots[index]) {
        const next = [...slots];
        next[index] = "";
        setSlots(next);
        return;
      }

      if (index > 0) {
        focusSlot(ref, index - 1);
        const next = [...slots];
        next[index - 1] = "";
        setSlots(next);
      }
      return;
    }

    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusSlot(ref, index - 1);
      return;
    }

    if (e.key === "ArrowRight" && index < 3) {
      e.preventDefault();
      focusSlot(ref, index + 1);
    }
  }

  async function handleContinue() {
    setError("");

    if (stage === "create") {
      if (pin.length !== 4) {
        setError("Enter your 4-digit PIN");
        return;
      }
      setCreatedPin(pin);
      setStage("confirm");
      setConfirmSlots(["", "", "", ""]);
      return;
    }

    if (stage === "confirm") {
      if (confirmPin.length !== 4) {
        setError("Re-enter your 4-digit PIN");
        return;
      }

      if (confirmPin !== createdPin) {
        setError("PIN does not match");
        setStage("create");
        setPinSlots(["", "", "", ""]);
        setConfirmSlots(["", "", "", ""]);
        setCreatedPin("");
        return;
      }

      setStage("saving");
      try {
        const res = await fetch("/api/pin/set", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pin: createdPin, confirm_pin: confirmPin }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };

        if (!res.ok || !json.ok) {
          setError(json.error || "Failed to save PIN");
          setStage("confirm");
          return;
        }

        setMustSetPin(false);
      } catch {
        setError("Network error. Please try again.");
        setStage("confirm");
      }
    }
  }

  if (checking && !mustSetPin) return null;
  if (!mustSetPin) return null;

  const title = stage === "confirm" ? "Confirm PIN" : "Create PIN";
  const subtitle = stage === "confirm" ? "Re-enter your 4-digit PIN" : "Create a 4-digit PIN to secure your account";

  const slots = stage === "confirm" ? confirmSlots : pinSlots;
  const setSlots = stage === "confirm" ? setConfirmSlots : setPinSlots;
  const ref = stage === "confirm" ? confirmInputsRef : pinInputsRef;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-[520px] rounded-[12px] border border-[#2E2E3A] bg-[#16161E] px-5 py-6 sm:px-10 sm:py-8">
        <h2 className="text-[20px] sm:text-[24px] font-bold text-white text-center">{title}</h2>
        <p className="mt-2 text-center text-[13px] sm:text-[14px] text-white/70">{subtitle}</p>

        <div className="mt-6 flex items-center justify-center gap-2">
          {slots.map((value, index) => (
            <input
              key={index}
              ref={(el) => {
                ref.current[index] = el;
              }}
              inputMode="numeric"
              pattern="[0-9]*"
              type="password"
              maxLength={1}
              value={value}
              onChange={(e) => handleSlotChange(ref, slots, setSlots, index, e.target.value)}
              onKeyDown={(e) => handleSlotKeyDown(ref, slots, setSlots, index, e)}
              className="h-[40px] w-[40px] sm:h-[48px] sm:w-[48px] rounded-lg border border-white/10 bg-white/[0.06] text-center text-[16px] sm:text-base text-white outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
              aria-label={`PIN digit ${index + 1}`}
            />
          ))}
        </div>

        {error ? <p className="mt-4 text-center text-[12px] text-red-400">{error}</p> : null}

        <button
          type="button"
          disabled={stage === "saving"}
          onClick={handleContinue}
          className="mt-6 w-full rounded-[12px] bg-[#1D78FF] py-[10px] sm:py-[12px] text-[14px] sm:text-[16px] font-medium text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#1E7BFF]/40"
        >
          {stage === "saving" ? "Saving..." : stage === "confirm" ? "Save PIN" : "Continue"}
        </button>
      </div>
    </div>
  );
}
