import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertIsNonEmptyString } from "@/lib/validators/auth";
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
  const rl = rateLimitByKey(`fp_verify:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const email = cookieStore.get("fp_email")?.value || "";

  let token = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    token = assertIsNonEmptyString(body.token, "token");
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error || !data?.session) {
      return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 400 });
    }

    // This cookie is the only client-readable signal (via middleware) that the
    // OTP step succeeded; it is httpOnly so client JS cannot forge it.
    cookieStore.set("fp_otp_verified", "true", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 10 * 60,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 400 });
  }
}
