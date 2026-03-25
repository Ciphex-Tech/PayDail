import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { rateLimitByKey } from "@/lib/security/rateLimit";

const IDEMPOTENCY_ENDPOINT = "/api/pin/set";
const IDEMPOTENCY_PROCESSING_STATUS = 102;

type ApiResponseJson = { ok: boolean; error?: string };

async function getIdempotencyResult(admin: ReturnType<typeof createSupabaseAdminClient>, params: {
  userId: string;
  endpoint: string;
  idempotencyKey: string;
}) {
  const { data, error } = await admin
    .from("idempotency_keys")
    .select("status, response_json")
    .eq("user_id", params.userId)
    .eq("endpoint", params.endpoint)
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();

  if (error) {
    console.error("/api/pin/set idempotency select error", { message: error.message });
    return null;
  }

  if (!data) return null;
  return {
    status: Number((data as any).status),
    json: (data as any).response_json as ApiResponseJson,
  };
}

async function beginIdempotency(admin: ReturnType<typeof createSupabaseAdminClient>, params: {
  userId: string;
  endpoint: string;
  idempotencyKey: string;
}) {
  const processing: ApiResponseJson = { ok: false, error: "processing" };

  const { error } = await admin.from("idempotency_keys").insert({
    user_id: params.userId,
    endpoint: params.endpoint,
    idempotency_key: params.idempotencyKey,
    status: IDEMPOTENCY_PROCESSING_STATUS,
    response_json: processing,
  } as any);

  if (!error) return { ok: true as const };

  // If unique constraint hit, another request already created this record.
  const code = String((error as any).code || "");
  const msg = String(error.message || "").toLowerCase();
  if (code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
    return { ok: false as const, duplicate: true as const };
  }

  console.error("/api/pin/set idempotency insert error", { message: error.message, code });
  return { ok: false as const, duplicate: false as const };
}

async function finalizeIdempotency(admin: ReturnType<typeof createSupabaseAdminClient>, params: {
  userId: string;
  endpoint: string;
  idempotencyKey: string;
  status: number;
  json: ApiResponseJson;
}) {
  const { error } = await admin
    .from("idempotency_keys")
    .update({ status: params.status, response_json: params.json } as any)
    .eq("user_id", params.userId)
    .eq("endpoint", params.endpoint)
    .eq("idempotency_key", params.idempotencyKey);

  if (error) {
    console.error("/api/pin/set idempotency update error", { message: error.message });
  }
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

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
    const idempotencyKey = (req.headers.get("idempotency-key") || "").trim();
    if (!idempotencyKey) {
      return NextResponse.json(
        { ok: false, error: "missing idempotency-key" },
        { status: 400 },
      );
    }

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

    const begin = await beginIdempotency(admin, {
      userId,
      endpoint: IDEMPOTENCY_ENDPOINT,
      idempotencyKey,
    });

    if (!begin.ok) {
      const existing = await getIdempotencyResult(admin, {
        userId,
        endpoint: IDEMPOTENCY_ENDPOINT,
        idempotencyKey,
      });

      if (existing) {
        if (existing.status === IDEMPOTENCY_PROCESSING_STATUS) {
          return NextResponse.json({ ok: false, error: "request in progress" }, { status: 409 });
        }
        return NextResponse.json(existing.json, { status: existing.status });
      }

      // If we can't begin and can't read existing, fail safe.
      return NextResponse.json({ ok: false, error: "Something went wrong. Try again" }, { status: 500 });
    }

    const ip = getClientIp(req);
    const rl = rateLimitByKey(`pin_set:${userId}:${ip}`, 5, 10 * 60_000);
    if (!rl.ok) {
      const headers = new Headers();
      if (typeof rl.retryAfterMs === "number") {
        headers.set("retry-after", String(Math.max(1, Math.ceil(rl.retryAfterMs / 1000))));
      }
      const json: ApiResponseJson = { ok: false, error: "too many requests" };
      await finalizeIdempotency(admin, {
        userId,
        endpoint: IDEMPOTENCY_ENDPOINT,
        idempotencyKey,
        status: 429,
        json,
      });
      return NextResponse.json(json, { status: 429, headers });
    }

    const { data: existing, error: existingErr } = await admin
      .from("users_info")
      .select("pin_hash")
      .eq("id", userId)
      .maybeSingle();

    if (existingErr) {
      console.error("/api/pin/set existing lookup error", { message: existingErr.message });
      const json: ApiResponseJson = { ok: false, error: "failed to check existing pin" };
      await finalizeIdempotency(admin, {
        userId,
        endpoint: IDEMPOTENCY_ENDPOINT,
        idempotencyKey,
        status: 500,
        json,
      });
      return NextResponse.json(json, { status: 500 });
    }

    const existingHash = (existing as any)?.pin_hash;
    if (typeof existingHash === "string" && existingHash.trim().length > 0) {
      const json: ApiResponseJson = { ok: false, error: "PIN already set" };
      await finalizeIdempotency(admin, {
        userId,
        endpoint: IDEMPOTENCY_ENDPOINT,
        idempotencyKey,
        status: 409,
        json,
      });
      return NextResponse.json(json, { status: 409 });
    }

    const pinHash = hashPin(pin);

    const { error: upsertErr } = await admin
      .from("users_info")
      .upsert({ id: userId, pin_hash: pinHash } as any, { onConflict: "id" });

    if (upsertErr) {
      console.error("/api/pin/set upsert error", { message: upsertErr.message });
      const json: ApiResponseJson = { ok: false, error: "failed to save pin" };
      await finalizeIdempotency(admin, {
        userId,
        endpoint: IDEMPOTENCY_ENDPOINT,
        idempotencyKey,
        status: 500,
        json,
      });
      return NextResponse.json(json, { status: 500 });
    }

    const json: ApiResponseJson = { ok: true };
    await finalizeIdempotency(admin, {
      userId,
      endpoint: IDEMPOTENCY_ENDPOINT,
      idempotencyKey,
      status: 200,
      json,
    });
    return NextResponse.json(json);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/pin/set unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
