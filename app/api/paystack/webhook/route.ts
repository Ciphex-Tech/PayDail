import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/paystack/client";
import { restoreWithdrawalBalanceOnce } from "@/lib/withdraw/restoreBalanceOnce";

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

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("/api/paystack/webhook invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body?.event as string;
  const data = body?.data ?? {};
  const reference = data?.reference as string | undefined;
  const providerReference = (data?.transfer_code as string | undefined) ?? null;

  console.info("/api/paystack/webhook", { event, reference });

  if (!reference) {
    return NextResponse.json({ ok: true });
  }

  const admin = createSupabaseAdminClient();

  const { data: wd } = await admin
    .from("withdrawals")
    .select("id, user_id, amount, status")
    .eq("reference", reference)
    .maybeSingle();

  if (!wd) {
    return NextResponse.json({ ok: true });
  }

  if (event === "transfer.success") {
    await admin
      .from("withdrawals")
      .update({
        status: "completed",
        provider_reference: providerReference,
        error_message: null,
        paystack_response: data,
      })
      .eq("id", wd.id);

    const { error: notifErr } = await admin.from("notifications").insert({
      user_id: wd.user_id,
      title: "Withdrawal Successful",
      message: `Your withdrawal of ₦${Number(wd.amount).toLocaleString()} has been sent to your bank account successfully.`,
      notification_type: "withdrawal_success",
      read: false,
      status: "completed",
    });

    if (!notifErr) {
      try {
        await incrementUnread(admin, wd.user_id);
      } catch (e: any) {
        console.error("/api/paystack/webhook unread_notifications increment error", {
          userId: wd.user_id,
          message: String(e?.message ?? e),
        });
      }
    }
  }

  if (event === "transfer.failed" || event === "transfer.reversed") {
    const reason = String(data?.reason ?? "Transfer failed");
    await admin
      .from("withdrawals")
      .update({
        status: "failed",
        provider_reference: providerReference,
        failure_reason: reason,
        error_message: reason,
        paystack_response: data,
      })
      .eq("id", wd.id);

    await restoreWithdrawalBalanceOnce({
      withdrawalId: wd.id,
      userId: wd.user_id,
      amount: Number(wd.amount),
    });

    const { error: notifErr } = await admin.from("notifications").insert({
      user_id: wd.user_id,
      title: "Withdrawal Failed",
      message: `Your withdrawal of ₦${Number(wd.amount).toLocaleString()} could not be processed. Your balance has been restored.`,
      notification_type: "withdrawal_failed",
      read: false,
      status: "failed",
    });

    if (!notifErr) {
      try {
        await incrementUnread(admin, wd.user_id);
      } catch (e: any) {
        console.error("/api/paystack/webhook unread_notifications increment error", {
          userId: wd.user_id,
          message: String(e?.message ?? e),
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
