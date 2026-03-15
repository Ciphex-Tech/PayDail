import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { executeWithdrawalTransfer } from "@/lib/withdraw/executeWithdrawalTransfer";
import { isWorkerAuthorized, unauthorizedWorkerResponse } from "@/lib/workers/workerAuth";
import { withWorkerLock } from "@/lib/workers/locks";

const BATCH_SIZE = 20;

function nowIso() {
  return new Date().toISOString();
}

async function runOnce() {
  const admin = createSupabaseAdminClient();

  const { data: withdrawals, error } = await admin
    .from("withdrawals")
    .select(
      "id,status,idempotency_key,external_reference,provider_reference,created_at,updated_at",
    )
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[worker.process-withdrawals] fetch error", error.message);
    return { ok: false as const, error: error.message };
  }

  if (!withdrawals || withdrawals.length === 0) {
    return { ok: true as const, processed: 0, failed: 0, skipped: 0 };
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const w of withdrawals as any[]) {
    try {
      const { data: locked, error: lockErr } = await admin
        .from("withdrawals")
        .update({ status: "processing", updated_at: nowIso() })
        .eq("id", w.id)
        .in("status", ["pending", "approved"])
        .is("provider_reference", null)
        .select("id");

      if (lockErr || !locked || locked.length === 0) {
        skipped++;
        continue;
      }

      await executeWithdrawalTransfer(w.id);
      processed++;
    } catch (e: any) {
      const message = String(e?.message ?? "worker_error");

      console.error("[worker.process-withdrawals] transfer error", {
        withdrawal_id: w.id,
        idempotency_key: w.idempotency_key,
        external_reference: w.external_reference,
        provider_reference: w.provider_reference,
        message,
      });

      await admin
        .from("withdrawals")
        .update({
          status: "pending",
          error_message: message,
          updated_at: nowIso(),
        })
        .eq("id", w.id);

      failed++;
    }
  }

  return { ok: true as const, processed, failed, skipped };
}

export async function GET(req: Request) {
  if (!isWorkerAuthorized(req)) return unauthorizedWorkerResponse();

  try {
    const result = await withWorkerLock("withdraw_process_withdrawals", runOnce);
    return NextResponse.json(result);
  } catch (e: any) {
    if (e?.code === "WORKER_ALREADY_RUNNING" || e?.message === "worker_already_running") {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_running" });
    }
    console.error("[worker.process-withdrawals] unhandled", e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? "unknown") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
