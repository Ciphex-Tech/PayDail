import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    let userId: string | null = data?.user?.id ?? null;

    if (error || !userId) {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice("bearer ".length).trim()
        : "";

      if (!token) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      userId = tokenData.user.id;
    }

    const body = (await req.json()) as Record<string, unknown>;
    const notificationId = String(body.id ?? "").trim();

    if (!notificationId) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const { error: updateErr } = await admin
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("user_id", userId);

    if (updateErr) {
      console.error("/api/notifications/mark-read update error", { message: updateErr.message });
      return NextResponse.json({ ok: false, error: "Failed to mark notification as read" }, { status: 500 });
    }

    const { count, error: countErr } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);

    if (countErr) {
      console.error("/api/notifications/mark-read count error", { message: countErr.message });
      return NextResponse.json({ ok: false, error: "Failed to compute unread count" }, { status: 500 });
    }

    const unread = Number(count ?? 0);

    const { error: userErr } = await admin
      .from("users_info")
      .update({ unread_notifications: unread })
      .eq("id", userId);

    if (userErr) {
      console.error("/api/notifications/mark-read users_info update error", { message: userErr.message });
      return NextResponse.json({ ok: false, error: "Failed to persist unread count" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, unread_notifications: unread });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/notifications/mark-read unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
