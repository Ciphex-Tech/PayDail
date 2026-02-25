import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertIsNonEmptyString } from "@/lib/validators/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const email = assertIsNonEmptyString(body.email, "email");
    const token = assertIsNonEmptyString(body.token, "token");

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.verifyOtp({
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

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/auth/verify-otp unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
