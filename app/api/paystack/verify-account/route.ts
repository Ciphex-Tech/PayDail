import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyBankAccount } from "@/lib/paystack/client";

export async function GET(req: Request) {
  let authenticated = false;

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice("bearer ".length).trim();
    const tokenClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    );
    const { data: tokenData } = await tokenClient.auth.getUser();
    if (tokenData?.user?.id) authenticated = true;
  }

  if (!authenticated) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) authenticated = true;
  }

  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const accountNumber = url.searchParams.get("account_number") ?? "";
  const bankCode = url.searchParams.get("bank_code") ?? "";

  if (!accountNumber || !bankCode) {
    return NextResponse.json({ error: "Missing account_number or bank_code" }, { status: 400 });
  }

  if (!/^\d{10}$/.test(accountNumber)) {
    return NextResponse.json({ error: "Account number must be 10 digits" }, { status: 400 });
  }

  const isTestMode = (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_");

  try {
    const result = await verifyBankAccount(accountNumber, bankCode);
    return NextResponse.json({ ok: true, account_name: result.account_name });
  } catch (e: any) {
    const status = e?.response?.status;
    const message: string = e?.response?.data?.message ?? e?.message ?? "";

    const isDailyLimitError =
      message.toLowerCase().includes("daily limit") ||
      message.toLowerCase().includes("test bank codes");

    if (isTestMode && isDailyLimitError) {
      return NextResponse.json({ ok: true, account_name: "Test Account (Unverified)" });
    }

    if (status === 422 || status === 400) {
      return NextResponse.json({ ok: false, error: "Account not found. Check the account number and bank." }, { status: 422 });
    }
    console.error("/api/paystack/verify-account error", e?.message, e?.response?.data);
    return NextResponse.json({ ok: false, error: "Could not verify account. Try again." }, { status: 400 });
  }
}
