import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimitByKey } from "@/lib/security/rateLimit";

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  const secure = process.env.NODE_ENV === "production";

  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimitByKey(`fp_resend:${ip}`, 5, 60_000);

  const cookieStore = await cookies();

  // Always respond with a non-enumerating message, even when rate limited.
  if (!rl.ok) {
    console.warn("[forgot-password][resend-otp] rate limited", {
      ip,
      remaining: rl.remaining,
      retryAfterMs: "retryAfterMs" in rl ? rl.retryAfterMs : undefined,
    });
    return NextResponse.json(
      { ok: true, message: "If an account exists for this email, a code has been sent." },
      { status: 200 },
    );
  }

  const email = cookieStore.get("fp_email")?.value || "";
  if (!email) {
    console.info("[forgot-password][resend-otp] missing fp_email cookie", { ip });
    return NextResponse.json(
      { ok: true, message: "If an account exists for this email, a code has been sent." },
      { status: 200 },
    );
  }

  const cooldownUntilRaw = cookieStore.get("fp_send_cooldown_until")?.value;
  const cooldownUntil = cooldownUntilRaw ? Number(cooldownUntilRaw) : 0;
  if (cooldownUntil && Date.now() < cooldownUntil) {
    console.info("[forgot-password][resend-otp] blocked by cooldown", {
      ip,
      cooldownUntil,
      secondsRemaining: Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)),
    });
    return NextResponse.json(
      { ok: true, message: "If an account exists for this email, a code has been sent." },
      { status: 200 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    console.info("[forgot-password][resend-otp] attempting resend", {
      ip,
      emailPresent: Boolean(email),
    });

    await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });
  } catch {
    // swallow errors to avoid leaking whether user exists
    console.warn("[forgot-password][resend-otp] resend attempt threw (suppressed)", {
      ip,
    });
  }

  cookieStore.set("fp_send_cooldown_until", String(Date.now() + 60_000), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.json(
    { ok: true, message: "If an account exists for this email, a code has been sent." },
    { status: 200 },
  );
}
