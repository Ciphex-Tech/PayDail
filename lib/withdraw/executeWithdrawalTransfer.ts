import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createTransferRecipient,
  initiateTransfer,
  verifyTransferByReference,
} from "@/lib/paystack/client";
import { restoreWithdrawalBalanceOnce } from "@/lib/withdraw/restoreBalanceOnce";

export type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  currency: string | null;
  status: string;
  idempotency_key: string | null;
  reference: string | null;
  external_reference: string | null;
  provider_reference: string | null;
  recipient_code: string | null;
  bank_code: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  paystack_response: any;
  failure_reason: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

async function incrementUnread(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: info, error: readErr } = await admin
      .from("users_info")
      .select("unread_notifications")
      .eq("id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const current = Number((info as any)?.unread_notifications ?? 0);
    const next = Math.max(0, current + 1);

    const { data: updated, error: updErr } = await admin
      .from("users_info")
      .update({ unread_notifications: next })
      .eq("id", userId)
      .eq("unread_notifications", (info as any)?.unread_notifications)
      .select("unread_notifications");
    if (updErr) throw new Error(updErr.message);
    if (updated && updated.length > 0) return;
  }
}

function isPaystackTestEnv(): boolean {
  const sk = String(process.env.PAYSTACK_SECRET_KEY ?? "");
  const pk = String(
    process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ??
      process.env.PAYSTACK_PUBLIC_KEY ??
      process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC ??
      "",
  );
  return sk.startsWith("sk_test") || pk.startsWith("pk_test");
}

async function simulateTestWebhookOutcome(params: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  withdrawal: WithdrawalRow;
  providerReference: string;
}) {
  const { admin, withdrawal: w, providerReference } = params;

  const roll = Math.random();
  const isSuccess = roll < 0.7;

  if (isSuccess) {
    await admin
      .from("withdrawals")
      .update({
        status: "completed",
        provider_reference: providerReference,
        error_message: null,
        failure_reason: null,
        updated_at: nowIso(),
      })
      .eq("id", w.id)
      .eq("status", "processing");

    const { error: notifErr } = await admin.from("notifications").insert({
      user_id: w.user_id,
      title: "Withdrawal Successful",
      message: `Your withdrawal of ₦${Number(w.amount).toLocaleString()} has been sent to your bank account successfully.`,
      notification_type: "withdrawal_success",
      read: false,
      status: "completed",
    });

    if (!notifErr) {
      try {
        await incrementUnread(admin, w.user_id);
      } catch (e: any) {
        console.error("[withdraw.execute] unread_notifications increment error", {
          userId: w.user_id,
          message: String(e?.message ?? e),
        });
      }
    }

    return { outcome: "success" as const };
  }

  const reason = "simulated_failure";
  await admin
    .from("withdrawals")
    .update({
      status: "failed",
      provider_reference: providerReference,
      failure_reason: reason,
      error_message: reason,
      updated_at: nowIso(),
    })
    .eq("id", w.id)
    .eq("status", "processing");

  await restoreWithdrawalBalanceOnce({
    withdrawalId: w.id,
    userId: w.user_id,
    amount: Number(w.amount),
  });

  const { error: notifErr } = await admin.from("notifications").insert({
    user_id: w.user_id,
    title: "Withdrawal Failed",
    message: `Your withdrawal of ₦${Number(w.amount).toLocaleString()} could not be processed. Your balance has been restored.`,
    notification_type: "withdrawal_failed",
    read: false,
    status: "failed",
  });

  if (!notifErr) {
    try {
      await incrementUnread(admin, w.user_id);
    } catch (e: any) {
      console.error("[withdraw.execute] unread_notifications increment error", {
        userId: w.user_id,
        message: String(e?.message ?? e),
      });
    }
  }

  return { outcome: "failed" as const };
}

function safeString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export async function executeWithdrawalTransfer(withdrawalId: string) {
  const admin = createSupabaseAdminClient();

  const { data: w0, error: readErr } = await admin
    .from("withdrawals")
    .select(
      "id,user_id,amount,currency,status,idempotency_key,reference,external_reference,provider_reference,recipient_code,bank_code,bank_name,account_number,account_name,paystack_response,failure_reason,error_message,created_at,updated_at",
    )
    .eq("id", withdrawalId)
    .maybeSingle();

  if (readErr || !w0) {
    throw new Error(readErr?.message || "withdrawal_not_found");
  }

  const w = w0 as WithdrawalRow;

  const logBase = {
    withdrawal_id: w.id,
    idempotency_key: w.idempotency_key,
    external_reference: w.external_reference ?? w.reference,
    provider_reference: w.provider_reference,
    status: w.status,
    at: nowIso(),
  };

  if (w.provider_reference) {
    console.info("[withdraw.execute] already_has_provider_reference", logBase);
    return { ok: true, alreadyExecuted: true, provider_reference: w.provider_reference };
  }

  if (!w.idempotency_key) {
    throw new Error("missing_idempotency_key");
  }

  const externalRef = String(w.external_reference ?? w.reference ?? "").trim();
  if (!externalRef) {
    throw new Error("missing_reference");
  }

  const { data: existingByIdem, error: idemErr } = await admin
    .from("withdrawals")
    .select("id,provider_reference")
    .neq("id", w.id)
    .eq("idempotency_key", w.idempotency_key)
    .not("provider_reference", "is", null)
    .limit(1);

  if (idemErr) {
    throw new Error(idemErr.message);
  }

  if (existingByIdem && existingByIdem.length > 0) {
    const existing = existingByIdem[0] as any;
    console.warn("[withdraw.execute] idempotency_key_reused", {
      ...logBase,
      existing_withdrawal_id: existing.id,
      existing_provider_reference: existing.provider_reference,
    });

    await admin
      .from("withdrawals")
      .update({
        provider_reference: existing.provider_reference,
        updated_at: nowIso(),
      })
      .eq("id", w.id);

    return {
      ok: true,
      alreadyExecuted: true,
      provider_reference: existing.provider_reference as string,
    };
  }

  const isTestMode = isPaystackTestEnv();
  const isUnverified = String(w.account_name ?? "").includes("Unverified");

  if (isTestMode && isUnverified) {
    const fakeTransferCode = `TEST_TRANSFER_${externalRef}`;

    await admin
      .from("withdrawals")
      .update({
        recipient_code: w.recipient_code ?? `TEST_RECIPIENT_${w.account_number}`,
        provider_reference: fakeTransferCode,
        paystack_response: { simulated: true, reference: externalRef },
        updated_at: nowIso(),
      })
      .eq("id", w.id);

    console.info("[withdraw.execute] simulated_transfer", {
      ...logBase,
      provider_reference: fakeTransferCode,
    });

    const simulated = await simulateTestWebhookOutcome({
      admin,
      withdrawal: w,
      providerReference: fakeTransferCode,
    });

    return {
      ok: true,
      simulated: true,
      provider_reference: fakeTransferCode,
      simulated_webhook: simulated,
    };
  }

  let recipientCode = w.recipient_code;

  if (!recipientCode) {
    if (!w.account_name || !w.account_number || !w.bank_code) {
      throw new Error("missing_bank_details");
    }

    const recipient = await createTransferRecipient(
      w.account_name,
      w.account_number,
      w.bank_code,
    );

    recipientCode = recipient.recipient_code;

    await admin
      .from("withdrawals")
      .update({ recipient_code: recipientCode, updated_at: nowIso() })
      .eq("id", w.id);
  }

  const amountKobo = Math.round(Number(w.amount) * 100);

  console.info("[withdraw.execute] initiating_transfer", {
    ...logBase,
    amount: w.amount,
    currency: w.currency ?? "NGN",
  });

  try {
    const transfer = await initiateTransfer(
      amountKobo,
      recipientCode,
      externalRef,
      `PayDail withdrawal ${externalRef}`,
    );

    await admin
      .from("withdrawals")
      .update({
        provider_reference: transfer.transfer_code,
        paystack_response: transfer,
        updated_at: nowIso(),
      })
      .eq("id", w.id);

    console.info("[withdraw.execute] transfer_initiated", {
      ...logBase,
      provider_reference: transfer.transfer_code,
    });

    if (isTestMode) {
      const simulated = await simulateTestWebhookOutcome({
        admin,
        withdrawal: w,
        providerReference: transfer.transfer_code,
      });
      return {
        ok: true,
        provider_reference: transfer.transfer_code,
        transfer,
        simulated_webhook: simulated,
      };
    }

    return { ok: true, provider_reference: transfer.transfer_code, transfer };
  } catch (e: any) {
    const msg = safeString(e?.response?.data?.message ?? e?.message ?? "transfer_error");

    console.error("[withdraw.execute] initiate_transfer_failed", {
      ...logBase,
      error: msg,
    });

    // Paystack can reject duplicate references; if so, verify and persist the existing transfer.
    if (/reference/i.test(msg) && /(taken|exists|duplicate)/i.test(msg)) {
      const verified = await verifyTransferByReference(externalRef);
      const providerRef = verified?.transfer_code;

      if (providerRef) {
        await admin
          .from("withdrawals")
          .update({
            provider_reference: providerRef,
            paystack_response: verified,
            updated_at: nowIso(),
          })
          .eq("id", w.id);

        console.warn("[withdraw.execute] duplicate_reference_recovered", {
          ...logBase,
          provider_reference: providerRef,
        });

        return { ok: true, alreadyExecuted: true, provider_reference: providerRef };
      }
    }

    await admin
      .from("withdrawals")
      .update({
        error_message: msg,
        failure_reason: msg,
        updated_at: nowIso(),
      })
      .eq("id", w.id);

    throw new Error(msg);
  }
}
