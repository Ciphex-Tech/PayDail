"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import TopToast from "@/app/_components/TopToast";

export default function ForgotPasswordVerifyPage() {
  const router = useRouter();

  const [otpSlots, setOtpSlots] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [errorToastOpen, setErrorToastOpen] = useState(false);

  const [resending, setResending] = useState(false);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const otp = useMemo(() => otpSlots.join(""), [otpSlots]);

  const resendCooldownSeconds = resendCooldownUntil
    ? Math.max(0, Math.ceil((resendCooldownUntil - now) / 1000))
    : 0;

  const maskedEmail = useMemo(() => {
    try {
      return window.sessionStorage.getItem("fp_masked_email") || "";
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (!resendCooldownUntil) return;
    if (Date.now() >= resendCooldownUntil) return;

    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [resendCooldownUntil]);

  function setSlot(idx: number, value: string) {
    const v = value.replace(/\D/g, "").slice(0, 1);
    setOtpSlots((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
  }

  function onChangeSlot(idx: number, value: string) {
    setSlot(idx, value);
    const digit = value.replace(/\D/g, "");
    if (digit && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    }
  }

  function onKeyDownSlot(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otpSlots[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    const digits = text.replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();

    setOtpSlots((prev) => {
      const next = [...prev];
      for (let i = 0; i < 6; i += 1) {
        next[i] = digits[i] || "";
      }
      return next;
    });

    const last = Math.min(5, digits.length - 1);
    inputsRef.current[Math.max(0, last)]?.focus();
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setErrorToastOpen(false);

    if (otp.length !== 6) {
      setErrorToastOpen(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: otp }),
      });

      const raw = await res.text();
      let json: { ok?: boolean; error?: string } = {};
      try {
        json = raw ? (JSON.parse(raw) as any) : {};
      } catch {
        // ignore
      }

      if (!res.ok || !json.ok) {
        setErrorToastOpen(true);
        return;
      }

      router.push("/forgot-password/reset");
    } catch {
      setErrorToastOpen(true);
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (resendCooldownSeconds > 0) return;

    setErrorToastOpen(false);
    setResending(true);
    try {
      await fetch("/api/auth/forgot-password/resend-otp", { method: "POST" });
      setResendCooldownUntil(Date.now() + 60_000);
    } catch {
      setErrorToastOpen(true);
    } finally {
      setResending(false);
    }
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
          <div className="relative w-full max-w-[660px] rounded-[12px] border border-[#2E2E3A] bg-[#16161E] pt-[36px] pb-[64px] px-[100px]">
            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="absolute top-[24px] left-[24px] inline-flex p-[8px] cursor-pointer rounded-[8px] border-1 border-[#626262] bg-[#2E2E3A] items-center gap-[10px]"
            >
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M1.60919 5.65667L6.32319 10.3707L5.38052 11.3133L0.195191 6.128C0.0702103 6.00298 0 5.83344 0 5.65667C0 5.47989 0.0702103 5.31035 0.195191 5.18533L5.38052 0L6.32319 0.942667L1.60919 5.65667Z"
                  fill="white"
                />
              </svg>
              <span className="text-[16px] font-medium">Back</span>
            </button>

            <div className="flex items-center justify-center gap-2">
              <Image src="/images/logo.svg" alt="PayDail" width={172} height={45} />
            </div>

            <div className="mt-[26px] text-center">
              <h2 className="text-[24px] font-bold">Forgot Password</h2>
              <p className="mt-[14px] text-[16px]">Verify email address to proceed</p>
              {maskedEmail ? (
                <p className="mt-[10px] text-[12px] text-white/60">
                  Enter the OTP sent to {maskedEmail}
                </p>
              ) : null}
            </div>

            <form className="mt-[66px]" onSubmit={verifyCode}>
              <div className="flex items-center justify-center gap-2">
                {otpSlots.map((v, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el;
                    }}
                    value={v}
                    onChange={(e) => onChangeSlot(i, e.target.value)}
                    onKeyDown={(e) => onKeyDownSlot(i, e)}
                    onPaste={onPaste}
                    inputMode="numeric"
                    className="h-[48px] w-[48px] rounded-[8px] border border-white/10 bg-white/[0.06] text-center text-[18px] text-white outline-none focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="mt-[24px] block w-full rounded-[12px] bg-[#1D78FF] py-[12px] text-[16px] font-medium text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#1E7BFF]/40"
              >
                {loading ? "Verifying..." : "Continue"}
              </button>

              <p className="mt-[24px] text-center text-[12px] text-white/60">
                Didn&apos;t get OTP?{" "}
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
          </div>
        </main>
      </div>
    </div>
  );
}
