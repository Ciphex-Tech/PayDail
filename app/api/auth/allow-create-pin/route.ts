import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function cookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ ok: false, error: "not authenticated" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set("allow_create_pin", "true", { ...cookieOptions(), maxAge: 10 * 60 });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/auth/allow-create-pin unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("allow_create_pin", "", { ...cookieOptions(), maxAge: 0 });
  return res;
}
