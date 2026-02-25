"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import TopToast from "@/app/_components/TopToast";

function validatePassword(pw: string) {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(pw)) return "Password must contain a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter.";
  if (!/\d/.test(pw)) return "Password must contain a number.";
  return null;
}

export default function ForgotPasswordResetPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorToastOpen, setErrorToastOpen] = useState(false);
  const [errorToastMessage, setErrorToastMessage] = useState(
    "Couldn't process the request",
  );

  const canContinue = useMemo(() => {
    return Boolean(
      password &&
        confirmPassword &&
        password === confirmPassword &&
        !validatePassword(password) &&
        !loading,
    );
  }, [confirmPassword, loading, password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorToastOpen(false);
    setErrorToastMessage("Couldn't process the request");

    const err = validatePassword(password);
    if (err) {
      setErrorToastOpen(true);
      return;
    }

    if (password !== confirmPassword) {
      setErrorToastOpen(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const raw = await res.text();
      let json: { ok?: boolean; error?: string; code?: string } = {};
      try {
        json = raw ? (JSON.parse(raw) as any) : {};
      } catch {
        // ignore
      }

      if (!res.ok || !json.ok) {
        if (json.code === "PASSWORD_SAME_AS_OLD") {
          setErrorToastMessage("New password cannot be old password");
        }
        setErrorToastOpen(true);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
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
              onClick={() => router.push("/forgot-password/verify")}
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
              <h2 className="text-[24px] font-bold">Create a password</h2>
              <p className="mt-[14px] text-[16px]">
                Set a new password to secure your account
              </p>
            </div>

            <form className="mt-[66px]" onSubmit={onSubmit}>
              <label className="block">
                <span className="text-[16px] font-medium text-white">
                  Enter password
                </span>
                <div className="relative mt-2">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="h-[48px] w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 pr-12 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <Image
                      src={showPassword ? "/images/eye-close.svg" : "/images/eye-open.svg"}
                      alt=""
                      width={18}
                      height={18}
                    />
                  </button>
                </div>
              </label>

              <label className="mt-[24px] block">
                <span className="text-[16px] font-medium text-white">
                  Confirm password
                </span>
                <div className="relative mt-2">
                  <input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Enter password"
                    className="h-[48px] w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 pr-12 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    <Image
                      src={showConfirmPassword ? "/images/eye-close.svg" : "/images/eye-open.svg"}
                      alt=""
                      width={18}
                      height={18}
                    />
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={!canContinue}
                className="mt-[48px] block w-full rounded-[12px] bg-[#1D78FF] py-[12px] text-[16px] font-medium text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#1E7BFF]/40"
              >
                {loading ? "Saving..." : "Continue"}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
