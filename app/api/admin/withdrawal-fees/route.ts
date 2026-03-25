import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();

    let authenticated = Boolean(!sessionError && sessionData?.user?.id);

    if (!authenticated) {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice("bearer ".length).trim()
        : "";

      if (token) {
        const tokenClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          },
        );
        const { data: tokenData } = await tokenClient.auth.getUser();
        if (tokenData?.user?.id) authenticated = true;
      }
    }

    if (!authenticated) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    const { data, error } = await admin
      .from("admin_rates")
      .select("small_fee, medium_fee, large_fee")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("/api/admin/withdrawal-fees admin_rates error", { message: error.message });
      return NextResponse.json({ ok: false, error: "failed to load fees" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      small_fee: Number((data as any)?.small_fee ?? 0),
      medium_fee: Number((data as any)?.medium_fee ?? 0),
      large_fee: Number((data as any)?.large_fee ?? 0),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/admin/withdrawal-fees unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
