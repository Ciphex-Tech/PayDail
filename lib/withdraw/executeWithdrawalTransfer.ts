import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createTransferRecipient,
  initiateTransfer,
  verifyTransferByReference,
} from "@/lib/paystack/client";

export type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  currency: string | null;
  status: string;
  idempotency_key: string | null;
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
      "id,user_id,amount,currency,status,idempotency_key,external_reference,provider_reference,recipient_code,bank_code,bank_name,account_number,account_name,paystack_response,failure_reason,error_message,created_at,updated_at",
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
    external_reference: w.external_reference,
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

  if (!w.external_reference) {
    throw new Error("missing_external_reference");
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

  const isTestMode = (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_");
  const isUnverified = String(w.account_name ?? "").includes("Unverified");

  if (isTestMode && isUnverified) {
    const fakeTransferCode = `TEST_TRANSFER_${w.external_reference}`;

    await admin
      .from("withdrawals")
      .update({
        recipient_code: w.recipient_code ?? `TEST_RECIPIENT_${w.account_number}`,
        provider_reference: fakeTransferCode,
        paystack_response: { simulated: true, reference: w.external_reference },
        updated_at: nowIso(),
      })
      .eq("id", w.id);

    console.info("[withdraw.execute] simulated_transfer", {
      ...logBase,
      provider_reference: fakeTransferCode,
    });

    return { ok: true, simulated: true, provider_reference: fakeTransferCode };
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
      w.external_reference,
      `PayDail withdrawal ${w.external_reference}`,
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

    return { ok: true, provider_reference: transfer.transfer_code, transfer };
  } catch (e: any) {
    const msg = safeString(e?.response?.data?.message ?? e?.message ?? "transfer_error");

    console.error("[withdraw.execute] initiate_transfer_failed", {
      ...logBase,
      error: msg,
    });

    // Paystack can reject duplicate references; if so, verify and persist the existing transfer.
    if (/reference/i.test(msg) && /(taken|exists|duplicate)/i.test(msg)) {
      const verified = await verifyTransferByReference(w.external_reference);
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
