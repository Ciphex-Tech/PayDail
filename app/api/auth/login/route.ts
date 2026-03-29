import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function cookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "email_and_password_required" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.user || !data?.session) {
      const msg = error?.message ?? "";
      let code = "invalid_credentials";
      if (/email not confirmed/i.test(msg)) code = "email_not_confirmed";
      return NextResponse.json({ ok: false, error: code }, { status: 401 });
    }

    const user = data.user;
    const session = data.session;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

    const admin = createSupabaseAdminClient();
    const { data: info } = await admin
      .from("users_info")
      .select("pin_hash")
      .eq("id", user.id)
      .maybeSingle();

    const pinHash = (info as any)?.pin_hash;
    const hasPin = typeof pinHash === "string" && pinHash.trim().length > 0;

    const safeUser = {
      id: user.id,
      email: user.email ?? null,
      full_name:
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.display_name === "string" && meta.display_name) ||
        null,
      first_name: typeof meta.first_name === "string" ? meta.first_name : null,
      last_name: typeof meta.last_name === "string" ? meta.last_name : null,
      email_verified: Boolean(user.email_confirmed_at),
    };

    const redirect = hasPin ? "/dashboard?toast=login_success" : "/create-pin";

    const clientType = (req.headers.get("x-client-type") ?? "").toLowerCase();
    const isMobile = clientType === "mobile" || clientType === "flutter";

    const responseBody: Record<string, unknown> = {
      ok: true,
      user: safeUser,
      has_pin: hasPin,
      redirect,
    };

    if (isMobile) {
      responseBody.access_token = session.access_token;
      responseBody.refresh_token = session.refresh_token;
      responseBody.expires_at = session.expires_at;
      responseBody.token_type = "bearer";
    }

    const res = NextResponse.json(responseBody);

    if (!hasPin) {
      res.cookies.set("allow_create_pin", "true", { ...cookieOptions(), maxAge: 10 * 60 });
    }

    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/auth/login unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
