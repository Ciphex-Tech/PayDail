import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function nowIso() {
  return new Date().toISOString();
}

export async function restoreWithdrawalBalanceOnce(params: {
  withdrawalId: string;
  userId: string;
  amount: number;
}) {
  const admin = createSupabaseAdminClient();

  const withdrawalId = params.withdrawalId;
  const userId = params.userId;
  const amount = Number(params.amount);

  if (!withdrawalId || !userId || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, restored: false as const, reason: "invalid_args" };
  }

  // Guard: only restore once per withdrawal.
  const { data: markRows, error: markErr } = await admin
    .from("withdrawals")
    .update({ balance_restored_at: nowIso(), updated_at: nowIso() })
    .eq("id", withdrawalId)
    .is("balance_restored_at", null)
    .select("id");

  if (markErr) {
    console.error("[withdraw.restore] mark error", { withdrawalId, message: markErr.message });
    return { ok: false as const, restored: false as const, reason: markErr.message };
  }

  if (!markRows || markRows.length === 0) {
    return { ok: true as const, restored: false as const, reason: "already_restored" };
  }

  // Best-effort atomic balance restore using compare-and-swap.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: info, error: readErr } = await admin
      .from("users_info")
      .select("naira_balance")
      .eq("id", userId)
      .maybeSingle();

    if (readErr) {
      console.error("[withdraw.restore] read balance error", { userId, message: readErr.message });
      return { ok: false as const, restored: false as const, reason: readErr.message };
    }

    const current = Number((info as any)?.naira_balance ?? 0);
    const next = current + amount;

    const { data: updated, error: updErr } = await admin
      .from("users_info")
      .update({ naira_balance: next })
      .eq("id", userId)
      .eq("naira_balance", (info as any)?.naira_balance)
      .select("naira_balance");

    if (updErr) {
      console.error("[withdraw.restore] update balance error", { userId, message: updErr.message });
      return { ok: false as const, restored: false as const, reason: updErr.message };
    }

    if (updated && updated.length > 0) {
      console.info("[withdraw.restore] restored", { withdrawalId, userId, amount });
      return { ok: true as const, restored: true as const };
    }
  }

  console.error("[withdraw.restore] restore failed after retries", { withdrawalId, userId, amount });
  return { ok: false as const, restored: false as const, reason: "balance_update_conflict" };
}
