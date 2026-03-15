import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MIN_WITHDRAWAL = 1_000;
const REVIEW_THRESHOLD = 100_000;

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    let userId: string | null = data?.user?.id ?? null;

    if (error || !userId) {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice("bearer ".length).trim()
        : "";

      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const tokenClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        },
      );

      const { data: tokenData, error: tokenError } = await tokenClient.auth.getUser();
      if (tokenError || !tokenData?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      userId = tokenData.user.id;
    }

    const admin = createSupabaseAdminClient();

    const body = (await req.json()) as Record<string, unknown>;
    const amount = Number(body.amount);
    const bankCode = String(body.bank_code ?? "").trim();
    const bankName = String(body.bank_name ?? "").trim();
    const accountNumber = String(body.account_number ?? "").trim();
    const accountName = String(body.account_name ?? "").trim();

    if (!bankCode || !bankName || !accountNumber || !accountName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (amount < MIN_WITHDRAWAL) {
      return NextResponse.json(
        { error: `Minimum withdrawal is ₦${MIN_WITHDRAWAL.toLocaleString()}` },
        { status: 400 },
      );
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({ error: "Account number must be 10 digits" }, { status: 400 });
    }

    const { data: userInfo, error: balErr } = await admin
      .from("users_info")
      .select("naira_balance")
      .eq("id", userId)
      .maybeSingle();

    if (balErr || !userInfo) {
      return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
    }

    const balance = Number(userInfo.naira_balance ?? 0);

    if (balance < amount) {
      return NextResponse.json(
        { error: `Insufficient balance. Available: ₦${balance.toLocaleString()}` },
        { status: 400 },
      );
    }

    const { data: deductRows, error: deductErr } = await admin
      .from("users_info")
      .update({ naira_balance: balance - amount })
      .eq("id", userId)
      .eq("naira_balance", userInfo.naira_balance)
      .select("naira_balance");

    if (deductErr) {
      return NextResponse.json({ error: "Failed to lock balance" }, { status: 500 });
    }

    if (!deductRows || deductRows.length === 0) {
      const { data: latestInfo } = await admin
        .from("users_info")
        .select("naira_balance")
        .eq("id", userId)
        .maybeSingle();

      const latestBalance = Number(latestInfo?.naira_balance ?? 0);
      if (latestBalance < amount) {
        return NextResponse.json(
          { error: `Insufficient balance. Available: ₦${latestBalance.toLocaleString()}` },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { error: "Your balance changed. Please refresh and try again." },
        { status: 409 },
      );
    }

    const status = amount > REVIEW_THRESHOLD ? "review_required" : "pending";
    const reference = `WD_${userId.replace(/-/g, "").slice(0, 10)}_${Date.now()}`;

    const { data: withdrawal, error: insertErr } = await admin
      .from("withdrawals")
      .insert({
        user_id: userId,
        amount,
        bank_code: bankCode,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        reference,
        status,
      })
      .select("id, reference, status, amount")
      .single();

    if (insertErr) {
      await admin
        .from("users_info")
        .update({ naira_balance: balance })
        .eq("id", userId);
      console.error("/api/withdraw insert error", insertErr.message);
      return NextResponse.json({ error: "Failed to create withdrawal request" }, { status: 500 });
    }

    const isReview = status === "review_required";
    await admin.from("notifications").insert({
      user_id: userId,
      title: isReview ? "Withdrawal Under Review" : "Withdrawal Pending",
      message: isReview
        ? `Your withdrawal of ₦${amount.toLocaleString()} is under review. Withdrawals above ₦100,000 require admin approval before processing.`
        : `Your withdrawal of ₦${amount.toLocaleString()} to ${accountName} (${bankName}) has been submitted and is being processed.`,
      notification_type: isReview ? "withdrawal_review" : "withdrawal_pending",
      read: false,
      status: "pending",
    });

    return NextResponse.json({ ok: true, withdrawal });
  } catch (e: any) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/withdraw unhandled error", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
