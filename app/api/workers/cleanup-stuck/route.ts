import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isWorkerAuthorized, unauthorizedWorkerResponse } from "@/lib/workers/workerAuth";
import { withWorkerLock } from "@/lib/workers/locks";
import { restoreWithdrawalBalanceOnce } from "@/lib/withdraw/restoreBalanceOnce";

const STUCK_MINUTES = 30;

function nowIso() {
  return new Date().toISOString();
}

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function runOnce() {
  const admin = createSupabaseAdminClient();
  const threshold = minutesAgoIso(STUCK_MINUTES);

  const { data: stuck, error } = await admin
    .from("withdrawals")
    .select("id,user_id,amount,status,provider_reference,external_reference,idempotency_key,created_at")
    .in("status", ["pending", "approved", "processing"])
    .lt("created_at", threshold)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[worker.cleanup-stuck] fetch error", error.message);
    return { ok: false as const, error: error.message };
  }

  if (!stuck || stuck.length === 0) {
    return { ok: true as const, cleaned: 0 };
  }

  const ids = stuck.map((s: any) => s.id);

  const { data: updatedRows, error: updateErr } = await admin
    .from("withdrawals")
    .update({
      status: "failed",
      error_message: "stuck_timeout",
      failure_reason: "stuck_timeout",
      updated_at: nowIso(),
    })
    .in("id", ids)
    .in("status", ["pending", "approved", "processing"])
    .select("id,user_id,amount");

  if (updateErr) {
    console.error("[worker.cleanup-stuck] update error", updateErr.message);
    return { ok: false as const, error: updateErr.message };
  }

  console.warn("[worker.cleanup-stuck] marked_failed", {
    count: ids.length,
    threshold,
  });

  for (const row of (updatedRows as any[]) ?? []) {
    await restoreWithdrawalBalanceOnce({
      withdrawalId: row.id,
      userId: row.user_id,
      amount: Number(row.amount),
    });
  }

  return { ok: true as const, cleaned: ids.length };
}

export async function GET(req: Request) {
  if (!isWorkerAuthorized(req)) return unauthorizedWorkerResponse();

  try {
    const result = await withWorkerLock("workers_cleanup_stuck", runOnce);
    return NextResponse.json(result);
  } catch (e: any) {
    if (e?.code === "WORKER_ALREADY_RUNNING" || e?.message === "worker_already_running") {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_running" });
    }
    console.error("[worker.cleanup-stuck] unhandled", e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? "unknown") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
