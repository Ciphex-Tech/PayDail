"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import TopToast from "@/app/_components/TopToast";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F7F7]" />}>
      <VerifyEmailPageInner />
    </Suspense>
  );
}

function VerifyEmailPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = useMemo(() => searchParams.get("email") ?? "", [searchParams]);

  const [guardStatus, setGuardStatus] = useState<"checking" | "ok" | "redirecting">("checking");

  const [otpSlots, setOtpSlots] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [errorToastOpen, setErrorToastOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const resendCooldownSeconds = resendCooldownUntil
    ? Math.max(0, Math.ceil((resendCooldownUntil - now) / 1000))
    : 0;

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const otp = useMemo(() => otpSlots.join(""), [otpSlots]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    let shouldRedirect = false;

    if (!email) {
      shouldRedirect = true;
    } else {
      try {
        const stored = window.sessionStorage.getItem("signup_email");
        if (stored && stored.toLowerCase() !== email.toLowerCase()) {
          shouldRedirect = true;
        }
      } catch {
        shouldRedirect = true;
      }
    }

    if (shouldRedirect) {
      setGuardStatus("redirecting");
      router.replace("/signup");
      return;
    }

    setGuardStatus("ok");
  }, [email, router]);

  useEffect(() => {
    if (!resendCooldownUntil) return;
    if (Date.now() >= resendCooldownUntil) return;

    const t = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(t);
  }, [resendCooldownUntil]);

  function focusSlot(index: number) {
    inputsRef.current[index]?.focus();
    inputsRef.current[index]?.select();
  }

  function setSlot(index: number, value: string) {
    setOtpSlots((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleChange(index: number, raw: string) {
    setErrorToastOpen(false);
    setResendMessage(null);

    const digits = raw.replace(/\D/g, "");

    if (digits.length === 0) {
      setSlot(index, "");
      return;
    }

    // If user pasted/typed multiple digits, spread them across slots
    if (digits.length > 1) {
      setOtpSlots((prev) => {
        const next = [...prev];
        let cursor = index;
        for (const ch of digits) {
          if (cursor > 5) break;
          next[cursor] = ch;
          cursor += 1;
        }
        return next;
      });

      const nextIndex = Math.min(index + digits.length, 6) - 1;
      focusSlot(Math.min(nextIndex + 1, 5));
      return;
    }

    setSlot(index, digits);
    if (index < 5) focusSlot(index + 1);
  }

  function handlePaste(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    setErrorToastOpen(false);
    setResendMessage(null);

    const text = e.clipboardData.getData("text");
    const digits = text.replace(/\D/g, "");
    if (!digits) return;

    e.preventDefault();

    setOtpSlots((prev) => {
      const next = [...prev];
      let cursor = index;
      for (const ch of digits) {
        if (cursor > 5) break;
        next[cursor] = ch;
        cursor += 1;
      }
      return next;
    });

    const endIndex = Math.min(index + digits.length, 6) - 1;
    focusSlot(Math.min(endIndex + 1, 5));
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    setResendMessage(null);

    if (e.key === "Backspace") {
      if (otpSlots[index]) {
        setSlot(index, "");
        return;
      }

      if (index > 0) {
        focusSlot(index - 1);
        setSlot(index - 1, "");
      }
      return;
    }

    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusSlot(index - 1);
      return;
    }

    if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      focusSlot(index + 1);
      return;
    }
  }

  async function resendCode() {
    setErrorToastOpen(false);
    setResendMessage(null);

    if (!email) {
      setErrorToastOpen(true);
      return;
    }

    if (resendCooldownUntil && Date.now() < resendCooldownUntil) {
      setErrorToastOpen(true);
      return;
    }

    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const raw = await res.text();
      let json: { ok?: boolean; error?: string } = {};
      try {
        json = raw ? (JSON.parse(raw) as { ok?: boolean; error?: string }) : {};
      } catch {
        // ignore non-json
      }

      if (!res.ok || !json.ok) {
        console.error("resend-otp failed", { status: res.status, raw });
        if (res.status === 429) {
          setResendCooldownUntil(Date.now() + 60_000);
        }
        throw new Error(json.error || "Failed to resend OTP");
      }

      setResendMessage("OTP resent. Please check your email.");
    } catch (err) {
      console.error("resend-otp error", err);
      setErrorToastOpen(true);
    } finally {
      setResending(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorToastOpen(false);

    if (!email) {
      setErrorToastOpen(true);
      return;
    }

    if (otp.trim().length < 6) {
      setErrorToastOpen(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, token: otp.trim() }),
      });

      const raw = await res.text();
      let json: { ok?: boolean; error?: string } = {};
      try {
        json = raw ? (JSON.parse(raw) as { ok?: boolean; error?: string }) : {};
      } catch {
        // ignore non-json
      }

      if (!res.ok || !json.ok) {
        console.error("verify-otp failed", { status: res.status, raw });
        throw new Error(json.error || "Failed to verify OTP");
      }

      try {
        window.sessionStorage.setItem("signup_verified", "true");
      } catch {
        // ignore
      }

      router.push("/signup/set-password");
    } catch (err) {
      console.error("verify-otp error", err);
      setErrorToastOpen(true);
    } finally {
      setLoading(false);
    }
  }

  if (guardStatus !== "ok") {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <TopToast
        open={errorToastOpen}
        message="Couldn't process the request"
        onClose={() => setErrorToastOpen(false)}
      />
      <div className="flex min-h-screen">
        <aside className="relative hidden w-[47%] overflow-hidden bg-[#1D78FF] md:block">
          <div className="relative flex h-full flex-col justify-center px-10">
            <h1 className="text-[48px] max-w-[630px] font-bold leading-tight tracking-tight">
              The fastest crypto to Naira conversion
            </h1>
            <p className="mt-4 max-w-[600px] text-[24px] text-white">
              We provide swift crypto to naira conversions, and seamless naira
              withdrawals
            </p>
          </div>
        </aside>

        <main className="relative w-[53%] flex items-center justify-center bg-[#0B0A0F] px-6 py-16">

          <div className="relative w-full max-w-[660px] rounded-[12px] border border-[#2E2E3A] bg-[#16161E] pt-[36px] pb-[64px] px-[70px]">
            <div className="flex items-center justify-center gap-2">
              <Image src="/images/logo.svg" alt="PayDail" width={172} height={45} />
            </div>

            <div className="mt-6 text-center">
              <h2 className="text-[24px] font-bold">Verify Email</h2>
              <p className="mt-[14px] text-[16px]">
                Verify email address to proceed
              </p>
            </div>

            <form className="mt-[66px] space-y-4" onSubmit={onSubmit}>
              <p className="text-center text-white text-[14px]">
                Enter the OTP sent to{" "}
                <span className="text-white font-medium">{email || "your email"}</span>
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  {otpSlots.map((value, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        inputsRef.current[index] = el;
                      }}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      type="text"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      value={value}
                      onChange={(e) => handleChange(index, e.target.value)}
                      onPaste={(e) => handlePaste(index, e)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="h-[48px] w-[48px] rounded-lg border border-white/10 bg-white/[0.06] text-center text-base text-white outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                      aria-label={`OTP digit ${index + 1}`}
                    />
                  ))}
                </div>
              </div>

              {resendMessage ? (
                <p className="text-center text-xs text-emerald-400">
                  {resendMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="rounded-[12px] mt-[48px] py-[12px] px-[72px] cursor-pointer block mx-auto bg-[#1D78FF] text-[16px] font-medium text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#1E7BFF]/40"
              >
                {loading ? "Verifying..." : "Continue"}
              </button>

              <p className="text-center text-[14px] font-light text-white mt-[100px]">
                Didn't get OTP?{" "}
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={resending || resendCooldownSeconds > 0}
                  className="text-white font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  {resendCooldownSeconds > 0
                    ? `Resend in ${resendCooldownSeconds}s`
                    : "Resend Code"}
                </button>
              </p>
            </form>
            <button
              type="button"
              onClick={() => router.push("/signup")}
              className="absolute top-[24px] left-[24px] inline-flex p-[8px] cursor-pointer rounded-[8px] border-1 border-[#626262] bg-[#2E2E3A] items-center gap-[10px]"
            >
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fillRule="evenodd" clipRule="evenodd" d="M1.60919 5.65667L6.32319 10.3707L5.38052 11.3133L0.195191 6.128C0.0702103 6.00298 0 5.83344 0 5.65667C0 5.47989 0.0702103 5.31035 0.195191 5.18533L5.38052 0L6.32319 0.942667L1.60919 5.65667Z" fill="white"/>
</svg>
<span className="text-[16px] font-medium">Back</span>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
