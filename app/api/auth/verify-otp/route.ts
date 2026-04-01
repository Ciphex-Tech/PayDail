import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertIsNonEmptyString } from "@/lib/validators/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const email = assertIsNonEmptyString(body.email, "email");
    const token = assertIsNonEmptyString(body.token, "token");

    const supabase = await createSupabaseServerClient();

    const { data: otpData, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      console.error("/api/auth/verify-otp supabase error", {
        message: error.message,
        status: error.status,
      });
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user ?? null;
      if (user?.id) {
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const paydailId = typeof meta.paydail_id === "string" ? meta.paydail_id.trim() : "";
        const firstName = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
        const lastName = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
        const phone = typeof meta.phone === "string" ? meta.phone.trim() : "";

        const admin = createSupabaseAdminClient();
        await admin
          .from("users_info")
          .upsert(
            {
              id: user.id,
              paydail_id: paydailId || null,
              first_name: firstName || null,
              last_name: lastName || null,
              phone: phone || null,
            } as any,
            { onConflict: "id" },
          );
      }
    } catch (e) {
      console.error("/api/auth/verify-otp users_info upsert error", e);
    }

    const clientType = (req.headers.get("x-client-type") ?? "").toLowerCase();
    const clientSecret = req.headers.get("x-mobile-secret") ?? "";
    const expectedSecret = process.env.MOBILE_API_SECRET ?? "";
    const isMobile =
      (clientType === "mobile" || clientType === "flutter") &&
      expectedSecret.length > 0 &&
      clientSecret === expectedSecret;

    const responseBody: Record<string, unknown> = { ok: true };

    if (isMobile && otpData?.session) {
      responseBody.access_token = otpData.session.access_token;
      responseBody.refresh_token = otpData.session.refresh_token;
      responseBody.expires_at = otpData.session.expires_at;
      responseBody.token_type = "bearer";
    }

    return NextResponse.json(responseBody);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/auth/verify-otp unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
