import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertPassword } from "@/lib/validators/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const password = assertPassword(body.password);

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("/api/auth/set-password not authenticated", {
        userError: userError?.message,
      });
      return NextResponse.json(
        { ok: false, error: "not authenticated" },
        { status: 401 },
      );
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error("/api/auth/set-password supabase error", {
        message: error.message,
        status: error.status,
      });
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/auth/set-password unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
