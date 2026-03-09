import { NextResponse } from "next/server";

import { registerWebhookUrl } from "@/lib/paystack/client";

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : req.headers.get("x-cron-secret") ?? "";

  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.PAYSTACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "PAYSTACK_WEBHOOK_URL is not set in environment" }, { status: 500 });
  }

  const result = await registerWebhookUrl(webhookUrl);

  console.info("[paystack/setup] webhook registration", { webhookUrl, ...result });

  return NextResponse.json({ ok: result.ok, webhookUrl, message: result.message });
}
