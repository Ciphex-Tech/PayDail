import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice("bearer ".length).trim()
        : "";

      if (!token) {
        console.error("/api/auth/set-password not authenticated", {
          userError: userError?.message,
        });
        return NextResponse.json(
          { ok: false, error: "not authenticated" },
          { status: 401 },
        );
      }

      const tokenClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );

      const { data, error } = await tokenClient.auth.getUser();
      if (error || !data?.user) {
        console.error("/api/auth/set-password bearer token invalid", {
          message: error?.message,
        });
        return NextResponse.json(
          { ok: false, error: "not authenticated" },
          { status: 401 },
        );
      }

      const admin = createSupabaseAdminClient();
      const { error: adminError } = await admin.auth.admin.updateUserById(
        data.user.id,
        { password },
      );

      if (adminError) {
        console.error("/api/auth/set-password admin update error", {
          message: adminError.message,
        });
        return NextResponse.json(
          { ok: false, error: adminError.message },
          { status: 400 },
        );
      }

      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const firstName = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
      const lastName = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
      const phone = typeof meta.phone === "string" ? meta.phone.trim() : "";

      const { error: upsertError } = await admin
        .from("users_info")
        .upsert(
          {
            id: data.user.id,
            first_name: firstName || null,
            last_name: lastName || null,
            phone: phone || null,
          } as any,
          { onConflict: "id" },
        );

      if (upsertError) {
        console.error("/api/auth/set-password users_info upsert error", {
          message: upsertError.message,
        });
        return NextResponse.json(
          { ok: false, error: "failed to persist user profile" },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error("/api/auth/set-password supabase error", {
        message: error.message,
        status: error.status,
      });
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const firstName = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const lastName = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const phone = typeof meta.phone === "string" ? meta.phone.trim() : "";

    const { error: upsertError } = await admin
      .from("users_info")
      .upsert(
        {
          id: user.id,
          first_name: firstName || null,
          last_name: lastName || null,
          phone: phone || null,
        } as any,
        { onConflict: "id" },
      );

    if (upsertError) {
      console.error("/api/auth/set-password users_info upsert error", {
        message: upsertError.message,
      });
      return NextResponse.json(
        { ok: false, error: "failed to persist user profile" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/auth/set-password unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
