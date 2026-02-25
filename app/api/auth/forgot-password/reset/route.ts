import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertPasswordReset } from "@/lib/validators/auth";
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
  const rl = rateLimitByKey(`fp_reset:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "Couldn't process the request" }, { status: 429 });
  }

  const cookieStore = await cookies();
  const verified = cookieStore.get("fp_otp_verified")?.value === "true";

  if (!verified) {
    return NextResponse.json({ ok: false, error: "Couldn't process the request" }, { status: 403 });
  }

  let password = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    password = assertPasswordReset(body.password);
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't process the request" }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ ok: false, error: "Couldn't process the request" }, { status: 403 });
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      const msg = (updateError.message || "").toLowerCase();
      const isSameAsOld =
        msg.includes("same") && (msg.includes("old") || msg.includes("previous"));

      if (isSameAsOld) {
        return NextResponse.json(
          { ok: false, code: "PASSWORD_SAME_AS_OLD", error: "Couldn't process the request" },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { ok: false, error: "Couldn't process the request" },
        { status: 400 },
      );
    }

    // Invalidate session after reset.
    await supabase.auth.signOut();

    // Clear forgot-password cookies
    cookieStore.set("fp_email", "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
    cookieStore.set("fp_send_cooldown_until", "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
    cookieStore.set("fp_otp_verified", "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't process the request" }, { status: 400 });
  }
}
