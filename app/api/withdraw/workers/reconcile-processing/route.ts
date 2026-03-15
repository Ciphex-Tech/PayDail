import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyTransferByReference } from "@/lib/paystack/client";
import { isWorkerAuthorized, unauthorizedWorkerResponse } from "@/lib/workers/workerAuth";
import { withWorkerLock } from "@/lib/workers/locks";
import { restoreWithdrawalBalanceOnce } from "@/lib/withdraw/restoreBalanceOnce";

const BATCH_SIZE = 50;

function nowIso() {
  return new Date().toISOString();
}

function normalizeProviderStatus(status: string | null | undefined): "completed" | "failed" | "processing" {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "successful") return "completed";
  if (s === "failed" || s === "failure" || s === "reversed" || s === "reversal") return "failed";
  return "processing";
}

async function runOnce() {
  const admin = createSupabaseAdminClient();

  const { data: withdrawals, error } = await admin
    .from("withdrawals")
    .select("id,user_id,amount,status,external_reference,provider_reference,idempotency_key")
    .eq("status", "processing")
    .not("external_reference", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[worker.reconcile-processing] fetch error", error.message);
    return { ok: false as const, error: error.message };
  }

  if (!withdrawals || withdrawals.length === 0) {
    return { ok: true as const, reconciled: 0, completed: 0, failed: 0, still_processing: 0 };
  }

  let reconciled = 0;
  let completed = 0;
  let failed = 0;
  let stillProcessing = 0;

  for (const w of withdrawals as any[]) {
    try {
      const verified = await verifyTransferByReference(String(w.external_reference));

      if (!verified) {
        stillProcessing++;
        continue;
      }

      const next = normalizeProviderStatus(verified.status);

      if (next === "processing") {
        await admin
          .from("withdrawals")
          .update({ paystack_response: verified, updated_at: nowIso() })
          .eq("id", w.id);
        stillProcessing++;
        reconciled++;
        continue;
      }

      await admin
        .from("withdrawals")
        .update({
          status: next,
          paystack_response: verified,
          error_message: next === "failed" ? String(verified.reason || "Transfer failed") : null,
          failure_reason: next === "failed" ? String(verified.reason || "Transfer failed") : null,
          updated_at: nowIso(),
        })
        .eq("id", w.id)
        .eq("status", "processing");

      if (next === "failed") {
        await restoreWithdrawalBalanceOnce({
          withdrawalId: w.id,
          userId: w.user_id,
          amount: Number(w.amount),
        });
      }

      if (next === "completed") completed++;
      if (next === "failed") failed++;
      reconciled++;
    } catch (e: any) {
      console.error("[worker.reconcile-processing] reconcile error", {
        withdrawal_id: w.id,
        external_reference: w.external_reference,
        provider_reference: w.provider_reference,
        idempotency_key: w.idempotency_key,
        message: String(e?.message ?? "unknown"),
      });
    }
  }

  return {
    ok: true as const,
    reconciled,
    completed,
    failed,
    still_processing: stillProcessing,
  };
}

export async function GET(req: Request) {
  if (!isWorkerAuthorized(req)) return unauthorizedWorkerResponse();

  try {
    const result = await withWorkerLock("withdraw_reconcile_processing", runOnce);
    return NextResponse.json(result);
  } catch (e: any) {
    if (e?.code === "WORKER_ALREADY_RUNNING" || e?.message === "worker_already_running") {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_running" });
    }
    console.error("[worker.reconcile-processing] unhandled", e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? "unknown") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
