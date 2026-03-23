import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isWorkerAuthorized, unauthorizedWorkerResponse } from "@/lib/workers/workerAuth";

async function generateUniquePaydailId(admin: ReturnType<typeof createSupabaseAdminClient>) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const value = String(Math.floor(10000000 + Math.random() * 90000000));

    const { data, error } = await admin
      .from("users_info")
      .select("id")
      .eq("paydail_id", value)
      .limit(1);

    if (error) {
      continue;
    }

    if (!data || data.length === 0) {
      return value;
    }
  }

  throw new Error("failed_to_generate_unique_paydail_id");
}

export async function POST(req: Request) {
  if (!isWorkerAuthorized(req)) {
    return unauthorizedWorkerResponse();
  }

  const admin = createSupabaseAdminClient();

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : 200;

  const { data: missing, error } = await admin
    .from("users_info")
    .select("id")
    .is("paydail_id", null)
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: "Failed to load users" }, { status: 500 });
  }

  const rows = (missing ?? []) as { id: string }[];

  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const paydailId = await generateUniquePaydailId(admin);
      const { error: updErr } = await admin
        .from("users_info")
        .update({ paydail_id: paydailId })
        .eq("id", row.id)
        .is("paydail_id", null);

      if (updErr) {
        failed += 1;
        continue;
      }

      updated += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, scanned: rows.length, updated, failed });
}
