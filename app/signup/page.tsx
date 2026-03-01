"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import TopToast from "@/app/_components/TopToast";

export default function SignUpPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorToastOpen, setErrorToastOpen] = useState(false);
  const [errorToastMessage, setErrorToastMessage] = useState(
    "Couldn't process the request",
  );
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [emailValidation, setEmailValidation] = useState<
    | { status: "idle" }
    | { status: "checking"; email: string }
    | { status: "valid"; email: string }
    | { status: "invalid"; email: string; reason?: string }
  >({ status: "idle" });

  function toastMessageForEmailValidation(reason?: string) {
    if (!reason || reason === "invalid_format") return "Please enter a valid email address.";
    if (reason === "network_error") return "Network connection is down";
    if (reason.startsWith("http_")) return "Network connection is down";
    return "Please enter a valid email address.";
  }

  function sanitizeName(v: string) {
    return v.replace(/\s+/g, " ").trim();
  }

  function sanitizeEmail(v: string) {
    return v.replace(/\s+/g, "").trim().toLowerCase();
  }

  function sanitizePhone(v: string) {
    return v.replace(/\D/g, "");
  }

  function sanitizeLettersOnly(v: string) {
    return v.replace(/[^A-Za-z\s]/g, "");
  }

  const sanitizedFirstName = useMemo(() => sanitizeName(firstName), [firstName]);
  const sanitizedLastName = useMemo(() => sanitizeName(lastName), [lastName]);
  const sanitizedEmail = useMemo(() => sanitizeEmail(email), [email]);
  const sanitizedPhone = useMemo(() => sanitizePhone(phone), [phone]);

  const emailFormatOk = useMemo(() => {
    if (!sanitizedEmail) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail);
  }, [sanitizedEmail]);

  const firstNameOk = useMemo(() => {
    if (!sanitizedFirstName) return false;
    return /^[A-Za-z\s]+$/.test(sanitizedFirstName);
  }, [sanitizedFirstName]);

  const lastNameOk = useMemo(() => {
    if (!sanitizedLastName) return false;
    return /^[A-Za-z\s]+$/.test(sanitizedLastName);
  }, [sanitizedLastName]);

  const phoneOk = useMemo(() => {
    if (!sanitizedPhone) return false;
    return /^\d+$/.test(sanitizedPhone);
  }, [sanitizedPhone]);

  const cooldownSeconds = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
    : 0;

  const canContinue =
    !loading &&
    cooldownSeconds === 0 &&
    firstNameOk &&
    lastNameOk &&
    phoneOk &&
    emailFormatOk &&
    emailValidation.status === "valid";

  useEffect(() => {
    if (!cooldownUntil) return;
    if (Date.now() >= cooldownUntil) return;

    const t = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(t);
  }, [cooldownUntil]);

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorToastOpen(false);
    setErrorToastMessage("Couldn't process the request");

    if (cooldownUntil && Date.now() < cooldownUntil) {
      setErrorToastOpen(true);
      return;
    }

    if (!sanitizedFirstName || !sanitizedLastName || !sanitizedEmail || !sanitizedPhone) {
      setErrorToastMessage("Please fill in all fields.");
      setErrorToastOpen(true);
      return;
    }

    if (!firstNameOk || !lastNameOk) {
      setErrorToastMessage("First name and last name must contain letters only.");
      setErrorToastOpen(true);
      return;
    }

    if (!phoneOk) {
      setErrorToastMessage("Phone number must contain numbers only.");
      setErrorToastOpen(true);
      return;
    }

    if (!emailFormatOk) {
      setErrorToastMessage("Please enter a valid email address.");
      setErrorToastOpen(true);
      return;
    }

    if (emailValidation.status === "checking") {
      setErrorToastMessage("Validating email, please wait...");
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
      const res = await fetch("/api/auth/signup-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: sanitizedFirstName,
          lastName: sanitizedLastName,
          email: sanitizedEmail,
          phone: sanitizedPhone,
        }),
      });

      const raw = await res.text();
      let json: { ok?: boolean; error?: string } = {};
      try {
        json = raw ? (JSON.parse(raw) as { ok?: boolean; error?: string }) : {};
      } catch {
        // ignore non-json
      }

      if (!res.ok || !json.ok) {
        console.error("signup-otp failed", { status: res.status, raw });
        if (res.status === 409 && (json as any)?.code === "USER_ALREADY_REGISTERED") {
          setErrorToastMessage("An account with this email may already exist. Try signing in or resetting your password.");
        }
        if (res.status === 429) {
          setCooldownUntil(Date.now() + 60_000);
        }
        throw new Error(json.error || "Failed to send OTP");
      }

      try {
        window.sessionStorage.setItem("signup_email", sanitizedEmail);
        window.sessionStorage.removeItem("signup_verified");
      } catch {
        // ignore
      }

      router.push(`/signup/verify?email=${encodeURIComponent(sanitizedEmail)}`);
    } catch (err) {
      console.error("signup submit error", err);
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

          <div className="relative w-full max-w-[660px] rounded-[12px] border border-[#2E2E3A] bg-[#16161E] pt-[36px] pb-[64px] px-[70px]">
            <div className="flex items-center justify-center gap-2">
              <Image src="/images/logo.svg" alt="PayDail" width={172} height={45} />
            </div>

            <div className="mt-[26px] text-center">
              <h2 className="text-[24px] font-bold">Create your account</h2>
              <p className="mt-[14px] text-[16px]">
                Enter your details to create a PayDail account
              </p>
            </div>

            <form className="mt-[36px]" onSubmit={onSubmit}>
              <div className="grid mb-[30px] grid-cols-1 gap-[20px] sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[16px] font-medium text-white">First name</span>
                  <input
                    name="firstName"
                    type="text"
                    placeholder="Karimu"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(sanitizeLettersOnly(e.target.value))}
                    className="h-[43px] w-full mt-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[16px] font-medium text-white">Last Name</span>
                  <input
                    name="lastName"
                    type="text"
                    placeholder="Tunde"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(sanitizeLettersOnly(e.target.value))}
                    className="h-[43px] w-full mt-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                  />
                </label>
              </div>
          
              <label className="space-y-1">
                <span className="text-[16px] font-medium text-white">Email Address</span>
                <input
                  name="email"
                  type="email"
                  placeholder="example@domain.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-[43px] w-full mt-2 mb-[30px] rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[16px] font-medium text-white">Phone Number</span>
                <input
                  name="phone"
                  type="tel"
                  placeholder="+234 800 373 8923"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  className="h-[43px] w-full mt-2 mb-[20px] rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#1E7BFF]/80 focus:ring-2 focus:ring-[#1E7BFF]/30"
                />
              </label>

              <button
                type="submit"
                disabled={!canContinue}
                className="rounded-[12px] py-[12px] px-[72px] cursor-pointer block mx-auto bg-[#1D78FF] text-[16px] font-medium text-white transition hover:bg-[#1A6EF0] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#1E7BFF]/40"
              >
                {loading
                  ? "Sending..."
                  : cooldownSeconds > 0
                    ? `Try again in ${cooldownSeconds}s`
                    : emailValidation.status === "checking"
                      ? "Validating..."
                    : "Continue"}
              </button>

              <p className="text-center text-[14px] text-white mt-[10px]">
                Are you one of us?{" "}
                <Link
                  href="/login"
                  className="font-bold  hover:text-[#1D78FF] transition-all cursor-pointer duration-0.8"
                >
                  Login
                </Link>
              </p>

              <p className="text-center mt-[40px] font-medium text-[16px] leading-6 text-white">
                By clicking on continue you understand that you agree to <span className="text-[#1D78FF] font-extrabold">PayDail&apos;s</span>{" "}
                <a
                  href="#"
                  className="text-white font-bold underline"
                >
                  Terms and condition
                </a>{" "}
                and{" "}
                <a
                  href="#"
                  className="text-white font-bold underline"
                >
                  Privacy Policy
                </a>
              </p>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
