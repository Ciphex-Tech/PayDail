import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ ok: false, error: "not authenticated" }, { status: 401 });
    }

    const userId = data.user.id;

    const admin = createSupabaseAdminClient();

    const { data: info, error: infoError } = await admin
      .from("users_info")
      .select("pin_hash")
      .eq("id", userId)
      .maybeSingle();

    if (infoError) {
      console.error("/api/pin/status users_info error", { message: infoError.message });
      return NextResponse.json({ ok: false, error: "failed to load pin status" }, { status: 500 });
    }

    const pinHash = (info as any)?.pin_hash;
    const hasPin = typeof pinHash === "string" && pinHash.trim().length > 0;

    return NextResponse.json({ ok: true, has_pin: hasPin });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/pin/status unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
