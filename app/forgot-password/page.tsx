"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import TopToast from "@/app/_components/TopToast";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorToastOpen, setErrorToastOpen] = useState(false);
  const [errorToastMessage, setErrorToastMessage] = useState(
    "Couldn't process the request",
  );
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [lastInvalidEmailToast, setLastInvalidEmailToast] = useState<string | null>(
    null,
  );

  const [emailValidation, setEmailValidation] = useState<
    | { status: "idle" }
    | { status: "checking"; email: string }
    | { status: "valid"; email: string }
    | { status: "invalid"; email: string; reason?: string }
  >({ status: "idle" });

  function toastMessageForEmailValidation(reason?: string) {
    if (!reason || reason === "invalid_format") return "Invalid email";
    if (reason === "network_error") return "Network connection is down";
    if (reason.startsWith("http_")) return "Network connection is down";
    return "Invalid email";
  }

  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const cooldownSeconds = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
    : 0;

  useEffect(() => {
    if (!cooldownUntil) return;
    if (Date.now() >= cooldownUntil) return;

    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [cooldownUntil]);

  function sanitizeEmail(v: string) {
    return v.replace(/\s+/g, "").trim().toLowerCase();
  }

  const sanitizedEmail = useMemo(() => sanitizeEmail(email), [email]);

  const emailFormatOk = useMemo(() => {
    if (!sanitizedEmail) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail);
  }, [sanitizedEmail]);

  useEffect(() => {
    if (!sanitizedEmail) {
      setEmailValidation({ status: "idle" });
      return;
    }

    if (!emailFormatOk) {
      setEmailValidation({ status: "invalid", email: sanitizedEmail, reason: "invalid_format" });
      return;
    }

    const t = window.setTimeout(async () => {
      setEmailValidation({ status: "checking", email: sanitizedEmail });
      try {
        const res = await fetch(
          `/api/validate-email?email=${encodeURIComponent(sanitizedEmail)}`,
          { method: "GET" },
        );

        const raw = await res.text();
        let json: { valid?: boolean; reason?: string } = {};
        try {
          json = raw ? (JSON.parse(raw) as any) : {};
        } catch {
          // ignore
        }

        if (!res.ok) {
          setEmailValidation({
            status: "invalid",
            email: sanitizedEmail,
            reason: json.reason || `http_${res.status}`,
          });
          return;
        }

        if (json.valid) {
          setEmailValidation({ status: "valid", email: sanitizedEmail });
        } else {
          setEmailValidation({
            status: "invalid",
            email: sanitizedEmail,
            reason: json.reason,
          });
        }
      } catch {
        setEmailValidation({ status: "invalid", email: sanitizedEmail, reason: "network_error" });
      }
    }, 2000);

    return () => window.clearTimeout(t);
  }, [emailFormatOk, sanitizedEmail]);

  useEffect(() => {
    if (emailValidation.status !== "invalid") return;
    if (!emailValidation.email) return;

    const msg = toastMessageForEmailValidation(emailValidation.reason);

    if (msg === "Invalid email") {
      if (lastInvalidEmailToast === emailValidation.email) return;
      setLastInvalidEmailToast(emailValidation.email);
    }

    setErrorToastMessage(msg);
    setErrorToastOpen(true);
  }, [emailValidation, lastInvalidEmailToast]);

  const canContinue = useMemo(() => {
    return Boolean(
      sanitizedEmail &&
        !loading &&
        cooldownSeconds === 0 &&
        emailValidation.status === "valid",
    );
  }, [cooldownSeconds, emailValidation.status, loading, sanitizedEmail]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorToastOpen(false);
    setErrorToastMessage("Couldn't process the request");
    setInfoMessage(null);

    if (!sanitizedEmail) {
      setErrorToastOpen(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: sanitizedEmail }),
      });

      const raw = await res.text();
      let json: { ok?: boolean; message?: string; maskedEmail?: string } = {};
      try {
        json = raw ? (JSON.parse(raw) as any) : {};
      } catch {
        // ignore
      }

      // Always show the same generic message to prevent user enumeration.
      setInfoMessage(
        "If an account exists for this email, a code has been sent.",
      );

      try {
        if (json.maskedEmail) {
          window.sessionStorage.setItem("fp_masked_email", json.maskedEmail);
        } else {
          window.sessionStorage.removeItem("fp_masked_email");
        }
      } catch {
        // ignore
      }

      setCooldownUntil(Date.now() + 60_000);

      // Navigate to verify regardless of response.
      router.push("/forgot-password/verify");

      if (!res.ok || json.ok === false) {
        // Intentionally ignore differences.
      }
    } catch {
      setInfoMessage(
        "If an account exists for this email, a code has been sent.",
      );
      setCooldownUntil(Date.now() + 60_000);
      router.push("/forgot-password/verify");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <TopToast
        open={errorToastOpen}
        message={errorToastMessage}
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
              onClick={() => router.push("/login")}
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
              <p className="mt-[14px] text-[16px]">We will send a code to your email</p>
            </div>

            <form className="mt-[66px]" onSubmit={onSubmit}>
              <label className="block">
                <span className="text-[16px] font-medium text-white">Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@domain.com"
                  required
                  className="h-[43px] w-full mt-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                />
              </label>

              <button
                type="submit"
                disabled={!canContinue}
                className="mt-[24px] block w-full rounded-[12px] bg-[#1D78FF] py-[12px] text-[16px] font-medium text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#1E7BFF]/40"
              >
                {loading
                  ? "Sending..."
                  : cooldownSeconds > 0
                    ? `Try again in ${cooldownSeconds}s`
                    : emailValidation.status === "checking"
                      ? "Validating..."
                    : "Continue"}
              </button>

              {infoMessage ? (
                <p className="mt-[16px] text-center text-[12px] text-white/70">
                  {infoMessage}
                </p>
              ) : null}

              <p className="mt-[60px] max-w-[220px] mx-auto text-center text-[12px] text-white">
                Check your spam folder if you don&apos;t receive the email within a few minutes.
              </p>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
