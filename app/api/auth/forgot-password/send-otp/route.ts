import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertIsNonEmptyString } from "@/lib/validators/auth";
import { rateLimitByKey } from "@/lib/security/rateLimit";

function isValidEmailFormat(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(req.url).origin;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "";
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}${"*".repeat(Math.max(0, local.length - shown.length))}@${domain}`;
}

export async function POST(req: NextRequest) {
  const secure = process.env.NODE_ENV === "production";

  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimitByKey(`fp_send:${ip}`, 5, 60_000);
  if (!rl.ok) {
    console.warn("[forgot-password][send-otp] rate limited", {
      ip,
      remaining: rl.remaining,
      retryAfterMs: "retryAfterMs" in rl ? rl.retryAfterMs : undefined,
    });
    return NextResponse.json(
      {
        ok: true,
        message: "If an account exists for this email, a code has been sent.",
      },
      { status: 200 },
    );
  }

  let email = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    email = assertIsNonEmptyString(body.email, "email").toLowerCase();
  } catch {
    return NextResponse.json(
      {
        ok: true,
        message: "If an account exists for this email, a code has been sent.",
      },
      { status: 200 },
    );
  }

  const cookieStore = await cookies();
  const cooldownUntilRaw = cookieStore.get("fp_send_cooldown_until")?.value;
  const cooldownUntil = cooldownUntilRaw ? Number(cooldownUntilRaw) : 0;
  if (cooldownUntil && Date.now() < cooldownUntil) {
    console.info("[forgot-password][send-otp] blocked by cooldown", {
      ip,
      cooldownUntil,
      secondsRemaining: Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)),
    });
    return NextResponse.json(
      {
        ok: true,
        message: "If an account exists for this email, a code has been sent.",
      },
      { status: 200 },
    );
  }

  if (!isValidEmailFormat(email)) {
    console.info("[forgot-password][send-otp] invalid email format (suppressed)", {
      ip,
      email,
    });
    return NextResponse.json(
      {
        ok: true,
        message: "If an account exists for this email, a code has been sent.",
      },
      { status: 200 },
    );
  }

  // Always return the same response to avoid user enumeration.
  try {
    const supabase = await createSupabaseServerClient();

    console.info("[forgot-password][send-otp] attempting send", {
      ip,
      maskedEmail: maskEmail(email),
    });

    await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });
  } catch (err) {
    // swallow errors to avoid leaking whether user exists
    console.warn("[forgot-password][send-otp] send attempt threw (suppressed)", {
      ip,
      maskedEmail: maskEmail(email),
      error: err instanceof Error ? err.message : String(err),
      causeCode:
        err && typeof err === "object" && "cause" in err && (err as any).cause
          ? (err as any).cause.code
          : undefined,
    });
  }

  // Store email and a resend cooldown as httpOnly cookies.
  cookieStore.set("fp_email", email, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60,
  });

  cookieStore.set("fp_send_cooldown_until", String(Date.now() + 60_000), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60,
  });

  cookieStore.set("fp_otp_verified", "false", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.json(
    {
      ok: true,
      message: "If an account exists for this email, a code has been sent.",
      maskedEmail: maskEmail(email),
    },
    { status: 200 },
  );
}
