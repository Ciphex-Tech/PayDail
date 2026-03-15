import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  let userId: string | null = data?.user?.id ?? null;

  if (error || !userId) {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice("bearer ".length).trim()
      : "";

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tokenClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    );

    const { data: tokenData, error: tokenError } = await tokenClient.auth.getUser();
    if (tokenError || !tokenData?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    userId = tokenData.user.id;
  }

  const admin = createSupabaseAdminClient();
  const { data: info, error: infoErr } = await admin
    .from("users_info")
    .select("naira_balance")
    .eq("id", userId)
    .maybeSingle();

  if (infoErr) {
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }

  const nairaBalance = Number(info?.naira_balance ?? 0);
  return NextResponse.json({ ok: true, naira_balance: nairaBalance });
}
