import axios from "axios";
import crypto from "crypto";

const BASE_URL = process.env.PAYSTACK_BASE_URL ?? "https://api.paystack.co";

function authHeaders() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export type Bank = {
  id: number;
  name: string;
  code: string;
  type: string;
};

export async function listBanks(): Promise<Bank[]> {
  const res = await axios.get(
    `${BASE_URL}/bank?country=nigeria&perPage=200&use_cursor=false`,
    { headers: authHeaders() },
  );
  return (res.data?.data ?? []) as Bank[];
}

export type AccountVerification = {
  account_name: string;
  account_number: string;
  bank_id: number;
};

export async function verifyBankAccount(
  accountNumber: string,
  bankCode: string,
): Promise<AccountVerification> {
  const res = await axios.get(
    `${BASE_URL}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { headers: authHeaders() },
  );
  return res.data.data as AccountVerification;
}

export type TransferRecipient = {
  recipient_code: string;
  id: number;
};

export async function createTransferRecipient(
  name: string,
  accountNumber: string,
  bankCode: string,
): Promise<TransferRecipient> {
  const res = await axios.post(
    `${BASE_URL}/transferrecipient`,
    {
      type: "nuban",
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN",
    },
    { headers: authHeaders() },
  );
  return res.data.data as TransferRecipient;
}

export type Transfer = {
  transfer_code: string;
  id: number;
  status: string;
  reference: string;
};

export async function initiateTransfer(
  amountKobo: number,
  recipientCode: string,
  reference: string,
  reason: string,
): Promise<Transfer> {
  const res = await axios.post(
    `${BASE_URL}/transfer`,
    {
      source: "balance",
      amount: amountKobo,
      recipient: recipientCode,
      reference,
      reason,
    },
    { headers: authHeaders() },
  );
  return res.data.data as Transfer;
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return false;
  const hash = crypto.createHmac("sha512", key).update(rawBody).digest("hex");
  return hash === signature;
}

export async function registerWebhookUrl(webhookUrl: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await axios.put(
      `${BASE_URL}/integration/update`,
      { webhook_url: webhookUrl },
      { headers: authHeaders() },
    );
    return { ok: true, message: res.data?.message ?? "Webhook URL updated" };
  } catch (e: any) {
    const msg = e?.response?.data?.message ?? e?.message ?? "Failed to register webhook";
    return { ok: false, message: msg };
  }
}
