"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopToast from "@/app/_components/TopToast";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorToastOpen, setErrorToastOpen] = useState(false);
  const [errorToastMessage, setErrorToastMessage] = useState(
    "Couldn't process the request",
  );
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

  function sanitizeEmail(v: string) {
    return v.replace(/\s+/g, "").trim().toLowerCase();
  }

  const sanitizedEmail = useMemo(() => sanitizeEmail(email), [email]);

  const emailFormatOk = useMemo(() => {
    if (!sanitizedEmail) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail);
  }, [sanitizedEmail]);

  function toastMessageForLoginError(err: any) {
    const code = (err?.code as string | undefined)?.toLowerCase();
    const status = err?.status as number | undefined;
    const message = (err?.message as string | undefined) ?? "";

    if (code === "invalid_credentials" || status === 400 || status === 401) {
      return "Invalid email or password";
    }

    if (/invalid login credentials/i.test(message)) {
      return "Invalid email or password";
    }

    if (/email not confirmed/i.test(message)) {
      return "Please verify your email before logging in";
    }

    return "Couldn't process the request";
  }

  useEffect(() => {
    if (!sanitizedEmail) {
      setEmailValidation({ status: "idle" });
      return;
    }

    if (!emailFormatOk) {
      setEmailValidation({
        status: "invalid",
        email: sanitizedEmail,
        reason: "invalid_format",
      });
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
          json = raw ? (JSON.parse(raw) as { valid?: boolean; reason?: string }) : {};
        } catch {
          // ignore non-json
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
        setEmailValidation({
          status: "invalid",
          email: sanitizedEmail,
          reason: "network_error",
        });
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
        password.trim() &&
        !loading &&
        emailValidation.status === "valid",
    );
  }, [emailValidation.status, loading, password, sanitizedEmail]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorToastOpen(false);
    setErrorToastMessage("Couldn't process the request");

    if (!sanitizedEmail || !password.trim()) {
      setErrorToastOpen(true);
      return;
    }

    if (emailValidation.status === "checking") {
      setErrorToastMessage("Couldn't process the request");
      setErrorToastOpen(true);
      return;
    }

    if (emailValidation.status === "invalid") {
      setErrorToastMessage(toastMessageForEmailValidation(emailValidation.reason));
      setErrorToastOpen(true);
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: sanitizedEmail,
        password,
      });

      if (error) {
        console.error("login failed", { message: error.message });
        throw error;
      }

      router.push("/dashboard?toast=login_success");
    } catch (e: any) {
      setErrorToastMessage(toastMessageForLoginError(e));
      setErrorToastOpen(true);
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
              onClick={() => router.push("/signup")}
              className="absolute top-[24px] left-[24px] inline-flex p-[8px] cursor-pointer rounded-[8px] border-1 border-[#626262] bg-[#2E2E3A] items-center gap-[10px]"
            >
              <svg
                width="7"
                height="12"
                viewBox="0 0 7 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
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
              <Image
                src="/images/logo.svg"
                alt="PayDail"
                width={172}
                height={45}
              />
            </div>

            <div className="mt-[26px] text-center">
              <h2 className="text-[24px] font-bold">Login</h2>
              <p className="mt-[14px] text-[16px]">
                Enter your credentials to access your account
              </p>
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

              <label className="mt-[24px] block">
                <span className="text-[16px] font-medium text-white">
                  Password
                </span>
                <div className="relative mt-2">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    className="h-[48px] w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 pr-12 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <Image
                      src={
                        showPassword
                          ? "/images/eye-close.svg"
                          : "/images/eye-open.svg"
                      }
                      alt=""
                      width={18}
                      height={18}
                    />
                  </button>
                </div>
              </label>

              <div className="mt-2 flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-[12px] font-bold text-white hover:text-[#1D78FF] transition-all cursor-pointer duration-0.8"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={!canContinue}
                className="mt-[24px] block w-full rounded-[12px] bg-[#1D78FF] py-[12px] text-[16px] font-medium text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#1E7BFF]/40"
              >
                {loading
                  ? "Signing in..."
                  : emailValidation.status === "checking"
                    ? "Validating..."
                    : "Continue"}
              </button>

              <p className="text-center text-[14px] text-white mt-[30px]">
                Don&apos;t have an account?{" "}
                <Link
                  href="/signup"
                  className="font-bold hover:text-[#1D78FF] transition-all cursor-pointer duration-0.8"
                >
                  Sign Up
                </Link>
              </p>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
