import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function normalizePin(raw: unknown) {
  const pin = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be 4 digits");
  }
  return pin;
}

function hashPin(pin: string) {
  const iterations = 120_000;
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(pin, salt, iterations, 32, "sha256");
  return `pbkdf2$sha256$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function getAuthenticatedUserId(req: Request): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (!error && data?.user?.id) return data.user.id;

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";

  if (!token) {
    throw new Error("not authenticated");
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

  const { data: tokenUser, error: tokenErr } = await tokenClient.auth.getUser();
  if (tokenErr || !tokenUser?.user?.id) {
    throw new Error("not authenticated");
  }

  return tokenUser.user.id;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const pin = normalizePin(body.pin);
    const confirmPin = normalizePin(body.confirm_pin ?? body.confirmPin ?? body.pin_confirm);

    if (pin !== confirmPin) {
      return NextResponse.json({ ok: false, error: "PIN does not match" }, { status: 400 });
    }

    let userId = "";
    try {
      userId = await getAuthenticatedUserId(req);
    } catch (e) {
      return NextResponse.json({ ok: false, error: "not authenticated" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    const { data: existing, error: existingErr } = await admin
      .from("users_info")
      .select("pin_hash")
      .eq("id", userId)
      .maybeSingle();

    if (existingErr) {
      console.error("/api/pin/set existing lookup error", { message: existingErr.message });
      return NextResponse.json({ ok: false, error: "failed to check existing pin" }, { status: 500 });
    }

    const existingHash = (existing as any)?.pin_hash;
    if (typeof existingHash === "string" && existingHash.trim().length > 0) {
      return NextResponse.json({ ok: false, error: "PIN already set" }, { status: 409 });
    }

    const pinHash = hashPin(pin);

    const { error: upsertErr } = await admin
      .from("users_info")
      .upsert({ id: userId, pin_hash: pinHash } as any, { onConflict: "id" });

    if (upsertErr) {
      console.error("/api/pin/set upsert error", { message: upsertErr.message });
      return NextResponse.json({ ok: false, error: "failed to save pin" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/pin/set unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
