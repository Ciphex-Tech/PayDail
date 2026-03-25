"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import TopToast from "@/app/_components/TopToast";
import { errorMessageForToast, fetchWithTimeout } from "@/lib/network/safeFetch";
import { createIdempotencyKey } from "@/lib/network/idempotency";

type Stage = "create" | "confirm" | "saving";

export default function CreatePinPage() {
  const router = useRouter();

  const [guardStatus, setGuardStatus] = useState<"checking" | "ok" | "redirecting">("checking");

  const [stage, setStage] = useState<Stage>("create");
  const [pinSlots, setPinSlots] = useState<string[]>(["", "", "", ""]);
  const [confirmSlots, setConfirmSlots] = useState<string[]>(["", "", "", ""]);
  const [createdPin, setCreatedPin] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [errorToastOpen, setErrorToastOpen] = useState(false);
  const [errorToastMessage, setErrorToastMessage] = useState("Couldn't process the request");

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const pin = useMemo(() => pinSlots.join(""), [pinSlots]);
  const confirmPin = useMemo(() => confirmSlots.join(""), [confirmSlots]);

  useEffect(() => {
    let canceled = false;

    async function run() {
      setGuardStatus("checking");
      try {
        // 1) Check PIN status; if already set, send user to dashboard.
        const st = await fetchWithTimeout("/api/pin/status", {
          method: "GET",
          cache: "no-store",
          retry: { retries: 1, delayMs: 400 },
          sensitive: false,
        });
        if (st.status === 401) {
          if (!canceled) {
            setGuardStatus("redirecting");
            router.replace("/login");
          }
          return;
        }

        const json = (await st.json()) as { ok?: boolean; has_pin?: boolean };
        const hasPin = Boolean(st.ok && json.ok && json.has_pin);
        if (hasPin) {
          if (!canceled) {
            setGuardStatus("redirecting");
            router.replace("/dashboard");
          }
          return;
        }

        if (!canceled) {
          setGuardStatus("ok");
        }
      } catch (err) {
        if (!canceled) {
          setErrorToastMessage(errorMessageForToast(err));
          setErrorToastOpen(true);
          setGuardStatus("ok");
        }
      }
    }

    run();
    return () => {
      canceled = true;
    };
  }, [router]);

  useEffect(() => {
    if (guardStatus !== "ok") return;
    inputsRef.current[0]?.focus();
  }, [guardStatus, stage]);

  function focusSlot(index: number) {
    inputsRef.current[index]?.focus();
    inputsRef.current[index]?.select();
  }

  function setSlot(setter: (fn: (prev: string[]) => string[]) => void, index: number, value: string) {
    setter((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleChange(index: number, raw: string) {
    setErrorToastOpen(false);

    const digits = raw.replace(/\D/g, "");
    const slots = stage === "confirm" ? confirmSlots : pinSlots;
    const setter = stage === "confirm" ? setConfirmSlots : setPinSlots;

    if (digits.length === 0) {
      setSlot(setter, index, "");
      return;
    }

    if (digits.length > 1) {
      setter((prev) => {
        const next = [...prev];
        let cursor = index;
        for (const ch of digits) {
          if (cursor > 3) break;
          next[cursor] = ch;
          cursor += 1;
        }
        return next;
      });

      const nextIndex = Math.min(index + digits.length, 4) - 1;
      focusSlot(Math.min(nextIndex + 1, 3));
      return;
    }

    setSlot(setter, index, digits);
    if (index < 3) focusSlot(index + 1);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    const slots = stage === "confirm" ? confirmSlots : pinSlots;
    const setter = stage === "confirm" ? setConfirmSlots : setPinSlots;

    if (e.key === "Backspace") {
      if (slots[index]) {
        setSlot(setter, index, "");
        return;
      }

      if (index > 0) {
        focusSlot(index - 1);
        setSlot(setter, index - 1, "");
      }
      return;
    }

    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusSlot(index - 1);
      return;
    }

    if (e.key === "ArrowRight" && index < 3) {
      e.preventDefault();
      focusSlot(index + 1);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorToastOpen(false);

    if (loading || stage === "saving") return;

    if (stage === "create") {
      if (pin.length !== 4) {
        setErrorToastMessage("Please enter your 4-digit PIN");
        setErrorToastOpen(true);
        return;
      }
      setCreatedPin(pin);
      setStage("confirm");
      setConfirmSlots(["", "", "", ""]);
      inputsRef.current = [];
      return;
    }

    if (stage === "confirm") {
      if (confirmPin.length !== 4) {
        setErrorToastMessage("Please re-enter your 4-digit PIN");
        setErrorToastOpen(true);
        return;
      }

      if (confirmPin !== createdPin) {
        setErrorToastMessage("PIN does not match");
        setErrorToastOpen(true);
        setStage("create");
        setPinSlots(["", "", "", ""]);
        setConfirmSlots(["", "", "", ""]);
        setCreatedPin("");
        inputsRef.current = [];
        return;
      }

      setStage("saving");
      setLoading(true);
      try {
        const idempotencyKey = createIdempotencyKey();
        const res = await fetchWithTimeout("/api/pin/set", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({ pin: createdPin, confirm_pin: confirmPin }),
          sensitive: true,
        });

        const raw = await res.text();
        let json: { ok?: boolean; error?: string } = {};
        try {
          json = raw ? (JSON.parse(raw) as any) : {};
        } catch {
          // ignore
        }

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Failed to save PIN");
        }

        // Clear the create-pin gate cookie.
        await fetch("/api/auth/allow-create-pin", { method: "DELETE" });

        router.replace("/dashboard?toast=login_success");
      } catch (err) {
        console.error("create-pin error", err);
        setErrorToastMessage(errorMessageForToast(err));
        setErrorToastOpen(true);
        setStage("confirm");
      } finally {
        setLoading(false);
      }
    }
  }

  if (guardStatus !== "ok") return null;

  const slots = stage === "confirm" ? confirmSlots : pinSlots;
  const title = stage === "confirm" ? "Confirm PIN" : "Create PIN";
  const subtitle = stage === "confirm" ? "Re-enter your 4-digit PIN" : "Create a 4-digit PIN to secure your account";

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <TopToast
        open={errorToastOpen}
        message={errorToastMessage}
        onClose={() => setErrorToastOpen(false)}
      />

      <div className="flex min-h-screen overflow-x-hidden">
        <aside className="relative hidden w-[47%] overflow-hidden bg-[#1D78FF] lg:block">
          <div className="relative flex h-full flex-col justify-center px-10">
            <h1 className="text-[48px] max-w-[630px] font-bold leading-tight tracking-tight">
              The fastest crypto to Naira conversion
            </h1>
            <p className="mt-4 max-w-[600px] text-[24px] text-white">
              We provide swift crypto to naira conversions, and seamless naira withdrawals
            </p>
          </div>
        </aside>

        <main className="relative w-[100%] lg:w-[53%] flex items-center justify-center bg-[#0B0A0F] px-6 py-16">
          <div className="relative w-full max-w-[660px] rounded-[12px] border border-[#2E2E3A] bg-[#16161E] pt-[36px] pb-[32px] px-[20px] sm:pt-[36px] sm:pb-[64px] sm:px-[70px]">
            <div className="flex items-center justify-center gap-2">
              <Image
                src="/images/logo.svg"
                alt="PayDail"
                width={172}
                height={45}
                className="w-[140px] h-[35px] sm:w-[172px] sm:h-[45px]"
              />
            </div>

            <div className="mt-[15px] sm:mt-[26px] text-center">
              <h2 className="text-[18px] sm:text-[24px] font-bold">{title}</h2>
              <p className="mt-[10px] sm:mt-[14px] text-[14px] sm:text-[16px] max-w-[340px] mx-auto sm:max-w-none">
                {subtitle}
              </p>
            </div>

            <form className="mt-[20px] sm:mt-[66px]" onSubmit={onSubmit}>
              <div className="flex items-center justify-center gap-2">
                {slots.map((value, index) => (
                  <input
                    key={`${stage}-${index}`}
                    ref={(el) => {
                      inputsRef.current[index] = el;
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    type="password"
                    maxLength={1}
                    value={value}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="h-[40px] w-[40px] sm:h-[48px] sm:w-[48px] rounded-lg border border-white/10 bg-white/[0.06] text-center text-[16px] sm:text-base text-white outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                    aria-label={`PIN digit ${index + 1}`}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading || stage === "saving"}
                className="rounded-[12px] mt-[48px] py-[10px] sm:py-[12px] w-full sm:w-auto sm:px-[72px] cursor-pointer block mx-auto bg-[#1D78FF] text-[14px] sm:text-[16px] font-medium text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#1E7BFF]/40"
              >
                {loading ? "Saving..." : stage === "confirm" ? "Save PIN" : "Continue"}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
