import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createTransferRecipient, initiateTransfer } from "@/lib/paystack/client";

const BATCH_SIZE = 10;
const TRANSFER_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const xHeader = req.headers.get("x-cron-secret");
  if (xHeader === cronSecret) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length).trim() === cronSecret;
  }

  return false;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: withdrawals, error } = await admin
    .from("withdrawals")
    .select("*")
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[withdraw/worker] fetch error", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!withdrawals || withdrawals.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, failed: 0 });
  }

  let processed = 0;
  let failed = 0;

  for (const w of withdrawals) {
    try {
      const { error: lockErr, data: locked } = await admin
        .from("withdrawals")
        .update({ status: "processing" })
        .eq("id", w.id)
        .in("status", ["pending", "approved"])
        .select("id");

      if (lockErr || !locked || locked.length === 0) {
        continue;
      }

      const isTestMode = (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_");
      const isUnverified = String(w.account_name ?? "").includes("Unverified");

      if (isTestMode && isUnverified) {
        const fakeTransferCode = `TEST_TRANSFER_${w.reference}`;
        await admin
          .from("withdrawals")
          .update({
            recipient_code: `TEST_RECIPIENT_${w.account_number}`,
            paystack_transfer_code: fakeTransferCode,
            paystack_response: { simulated: true, reference: w.reference },
            status: "processing",
          })
          .eq("id", w.id);

        processed++;
        await sleep(TRANSFER_DELAY_MS);
        continue;
      }

      let recipientCode = (w.recipient_code as string | null) ?? null;

      if (!recipientCode) {
        const recipient = await createTransferRecipient(
          w.account_name,
          w.account_number,
          w.bank_code,
        );
        recipientCode = recipient.recipient_code;
      }

      const amountKobo = Math.round(Number(w.amount) * 100);
      const transfer = await initiateTransfer(
        amountKobo,
        recipientCode,
        w.reference,
        `PayDail withdrawal ${w.reference}`,
      );

      await admin
        .from("withdrawals")
        .update({
          recipient_code: recipientCode,
          paystack_transfer_code: transfer.transfer_code,
          paystack_response: transfer,
          status: "processing",
        })
        .eq("id", w.id);

      processed++;

      await sleep(TRANSFER_DELAY_MS);
    } catch (e: any) {
      console.error("[withdraw/worker] error", {
        id: w.id,
        reference: w.reference,
        message: e?.message,
        response: e?.response?.data,
      });

      await admin
        .from("withdrawals")
        .update({
          status: "pending",
          failure_reason: String(e?.response?.data?.message ?? e?.message ?? "Worker error"),
        })
        .eq("id", w.id);

      failed++;
    }
  }

  console.info("[withdraw/worker] done", { processed, failed });
  return NextResponse.json({ ok: true, processed, failed });
}
export async function GET(req: Request) {
  return POST(req);
}