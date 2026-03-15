import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isWorkerAuthorized, unauthorizedWorkerResponse } from "@/lib/workers/workerAuth";
import { withWorkerLock } from "@/lib/workers/locks";
import { restoreWithdrawalBalanceOnce } from "@/lib/withdraw/restoreBalanceOnce";
import { verifyTransferByReference } from "@/lib/paystack/client";

const STUCK_MINUTES = 30;

function nowIso() {
  return new Date().toISOString();
}

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function normalizeProviderStatus(status: string | null | undefined): "completed" | "failed" | "processing" {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "successful") return "completed";
  if (s === "failed" || s === "reversed") return "failed";
  return "processing";
}

async function runOnce() {
  const admin = createSupabaseAdminClient();
  const threshold = minutesAgoIso(STUCK_MINUTES);

  const { data: stuck, error } = await admin
    .from("withdrawals")
    .select(
      "id,user_id,amount,status,reference,provider_reference,external_reference,idempotency_key,created_at,updated_at",
    )
    .or(
      `and(status.in.(pending,approved),created_at.lt.${threshold}),and(status.eq.processing,updated_at.lt.${threshold})`,
    )
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[worker.cleanup-stuck] fetch error", error.message);
    return { ok: false as const, error: error.message };
  }

  if (!stuck || stuck.length === 0) {
    return { ok: true as const, cleaned: 0 };
  }

  const pendingApproved = stuck.filter((s: any) => ["pending", "approved"].includes(String(s.status)));
  const processing = stuck.filter((s: any) => String(s.status) === "processing");

  let failed = 0;
  let review_required = 0;
  let completed = 0;
  let verified_processing = 0;

  if (pendingApproved.length > 0) {
    const ids = pendingApproved.map((s: any) => s.id);
    const { data: updatedRows, error: updateErr } = await admin
      .from("withdrawals")
      .update({
        status: "failed",
        error_message: "stuck_timeout",
        failure_reason: "stuck_timeout",
        updated_at: nowIso(),
      })
      .in("id", ids)
      .in("status", ["pending", "approved"])
      .select("id,user_id,amount");

    if (updateErr) {
      console.error("[worker.cleanup-stuck] update pending/approved error", updateErr.message);
      return { ok: false as const, error: updateErr.message };
    }

    for (const row of (updatedRows as any[]) ?? []) {
      failed++;
      await restoreWithdrawalBalanceOnce({
        withdrawalId: row.id,
        userId: row.user_id,
        amount: Number(row.amount),
      });
    }
  }

  for (const w of processing as any[]) {
    try {
      const ref = String(w.external_reference ?? w.reference ?? "").trim();
      if (!ref) continue;

      const verified = await verifyTransferByReference(ref);
      if (!verified) continue;

      const next = normalizeProviderStatus((verified as any).status);
      if (next === "processing") {
        await admin
          .from("withdrawals")
          .update({
            status: "review_required",
            error_message: "stuck_processing_requires_review",
            failure_reason: "stuck_processing_requires_review",
            paystack_response: verified,
            updated_at: nowIso(),
          })
          .eq("id", w.id)
          .eq("status", "processing");

        verified_processing++;
        review_required++;
        continue;
      }

      if (next === "completed") {
        await admin
          .from("withdrawals")
          .update({
            status: "completed",
            paystack_response: verified,
            updated_at: nowIso(),
          })
          .eq("id", w.id)
          .eq("status", "processing");

        completed++;
        continue;
      }

      await admin
        .from("withdrawals")
        .update({
          status: "failed",
          paystack_response: verified,
          error_message: String((verified as any).reason || "Transfer failed"),
          failure_reason: String((verified as any).reason || "Transfer failed"),
          updated_at: nowIso(),
        })
        .eq("id", w.id)
        .eq("status", "processing");

      failed++;
      await restoreWithdrawalBalanceOnce({
        withdrawalId: w.id,
        userId: w.user_id,
        amount: Number(w.amount),
      });
    } catch (e: any) {
      console.error("[worker.cleanup-stuck] processing verify error", {
        withdrawal_id: w.id,
        external_reference: w.external_reference,
        message: String(e?.message ?? "unknown"),
      });
    }
  }

  console.warn("[worker.cleanup-stuck] cleaned", {
    threshold,
    pending_approved_failed: failed,
    processing_to_review_required: review_required,
    processing_completed: completed,
    processing_verified_still_processing: verified_processing,
  });

  return {
    ok: true as const,
    failed,
    review_required,
    completed,
  };
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
