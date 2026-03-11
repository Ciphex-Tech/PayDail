import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listBanks } from "@/lib/paystack/client";

export const revalidate = 3600;

export async function GET(req: Request) {
  let authenticated = false;

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice("bearer ".length).trim();
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

  if (!authenticated) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) authenticated = true;
  }

  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const banks = await listBanks();
    return NextResponse.json({ banks });
  } catch (e: any) {
    console.error("/api/paystack/banks error", e?.message);
    return NextResponse.json({ banks: [], error: "Failed to fetch banks" }, { status: 500 });
  }
}
