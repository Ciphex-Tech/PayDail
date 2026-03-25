import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withRequiredLock } from "@/lib/workers/locks";

const MIN_WITHDRAWAL = 100;
const REVIEW_THRESHOLD = 100_000;
const DUPLICATE_GUARD_SECONDS = 60;

type WithdrawalType = "bank_transfer" | "paydail_transfer" | "crypto_transfer";

function normalizePin(raw: unknown) {
  const pin = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be 4 digits");
  }
  return pin;
}

function verifyPin(pin: string, pinHash: string) {
  const parts = String(pinHash || "").split("$");
  if (parts.length !== 5) return false;
  if (parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;

  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const salt = Buffer.from(parts[3] || "", "base64");
  const expected = Buffer.from(parts[4] || "", "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = crypto.pbkdf2Sync(pin, salt, iterations, expected.length, "sha256");
  try {
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function makeShortDedupeReference(params: {
  userId: string;
  amount: number;
  bankCode: string;
  accountNumber: string;
}) {
  const { userId, amount, bankCode, accountNumber } = params;

  // 15s bucket: allows multiple withdrawals over time, but collapses rapid re-clicks.
  const bucket = Math.floor(Date.now() / 15_000);
  const shortUser = userId.replace(/-/g, "").slice(0, 10);

  const hash = crypto
    .createHash("sha256")
    .update(`${userId}:${amount}:${bankCode}:${accountNumber}:${bucket}`)
    .digest("hex")
    .slice(0, 10);

  return `WD_${shortUser}_${bucket}_${hash}`;
}

async function refundBalanceByAmount(params: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  amount: number;
}) {
  const { admin, userId, amount } = params;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: info, error: readErr } = await admin
      .from("users_info")
      .select("naira_balance")
      .eq("id", userId)
      .maybeSingle();

    if (readErr) throw new Error(readErr.message);

    const current = Number((info as any)?.naira_balance ?? 0);
    const next = current + amount;

    const { data: updated, error: updErr } = await admin
      .from("users_info")
      .update({ naira_balance: next })
      .eq("id", userId)
      .eq("naira_balance", (info as any)?.naira_balance)
      .select("naira_balance");

    if (updErr) throw new Error(updErr.message);
    if (updated && updated.length > 0) return;
  }

  throw new Error("refund_balance_conflict");
}

async function incrementUnreadNotifications(params: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  delta: number;
}) {
  const { admin, userId, delta } = params;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: info, error: readErr } = await admin
      .from("users_info")
      .select("unread_notifications")
      .eq("id", userId)
      .maybeSingle();

    if (readErr) throw new Error(readErr.message);

    const current = Number((info as any)?.unread_notifications ?? 0);
    const next = Math.max(0, current + delta);

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
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      userId = tokenData.user.id;
    }

    const body = (await req.json()) as Record<string, unknown>;
    const amount = Number(body.amount);
    const withdrawalType = String(body.withdrawal_type ?? "").trim() as WithdrawalType;
    const narration = String(body.narration ?? "").trim();

    let pin = "";
    try {
      pin = normalizePin(body.pin);
    } catch {
      return NextResponse.json({ ok: false, error: "PIN is required" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const { data: pinInfo, error: pinErr } = await admin
      .from("users_info")
      .select("pin_hash")
      .eq("id", userId)
      .maybeSingle();

    if (pinErr) {
      console.error("/api/withdraw pin lookup error", { message: pinErr.message });
      return NextResponse.json({ ok: false, error: "failed to verify pin" }, { status: 500 });
    }

    const pinHash = String((pinInfo as any)?.pin_hash ?? "");
    if (!pinHash || pinHash.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "PIN not set" }, { status: 400 });
    }

    const pinOk = verifyPin(pin, pinHash);
    if (!pinOk) {
      return NextResponse.json({ ok: false, error: "Wrong PIN" }, { status: 401 });
    }

    const bankCode = String(body.bank_code ?? "").trim();
    const bankName = String(body.bank_name ?? "").trim();
    const accountNumber = String(body.account_number ?? "").trim();
    const accountName = String(body.account_name ?? "").trim();

    if (
      withdrawalType !== "bank_transfer" &&
      withdrawalType !== "paydail_transfer" &&
      withdrawalType !== "crypto_transfer"
    ) {
      return NextResponse.json({ error: "Invalid withdrawal type" }, { status: 400 });
    }

    if (withdrawalType === "bank_transfer") {
      if (!bankCode || !bankName || !accountNumber || !accountName) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
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

    if (withdrawalType === "bank_transfer") {
      if (!/^(\d{10})$/.test(accountNumber)) {
        return NextResponse.json({ error: "Account number must be 10 digits" }, { status: 400 });
      }
    }

    try {
      return await withRequiredLock(`withdraw_create_${userId}`, async () => {
        const dedupeRef = makeShortDedupeReference({
          userId,
          amount,
          bankCode,
          accountNumber,
        });

        // Idempotency (Option B): collapse rapid repeat clicks by returning the existing withdrawal
        // with the same deterministic reference within this short time bucket.
        const { data: existingByRef } = await admin
          .from("withdrawals")
          .select("id,reference,status,created_at")
          .eq("user_id", userId)
          .eq("reference", dedupeRef)
          .limit(1);

        if (existingByRef && existingByRef.length > 0) {
          return NextResponse.json({ ok: true, withdrawal: existingByRef[0], deduped: true });
        }

        const { data: rates, error: ratesErr } = await admin
          .from("admin_rates")
          .select("small_fee, medium_fee, large_fee")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (ratesErr) {
          console.error("/api/withdraw admin_rates error", { message: ratesErr.message });
          return NextResponse.json({ error: "Failed to load withdrawal fees" }, { status: 500 });
        }

        const smallFee = Number((rates as any)?.small_fee ?? 0);
        const mediumFee = Number((rates as any)?.medium_fee ?? 0);
        const largeFee = Number((rates as any)?.large_fee ?? 0);

        const fee =
          amount >= 100 && amount <= 19_999
            ? smallFee
            : amount >= 20_000 && amount <= 99_999
              ? mediumFee
              : amount >= 100_000
                ? largeFee
                : 0;

        const totalDebit = Math.max(0, amount + (Number.isFinite(fee) ? fee : 0));

        const { data: userInfo, error: balErr } = await admin
          .from("users_info")
          .select("naira_balance")
          .eq("id", userId)
          .maybeSingle();

        if (balErr || !userInfo) {
          return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
        }

        const balance = Number(userInfo.naira_balance ?? 0);

        if (balance < totalDebit) {
          return NextResponse.json(
            {
              error: `Insufficient balance. Available: ₦${balance.toLocaleString()}`,
            },
            { status: 400 },
          );
        }

        const { data: deductRows, error: deductErr } = await admin
          .from("users_info")
          .update({ naira_balance: balance - totalDebit })
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
          if (latestBalance < totalDebit) {
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
        const reference = dedupeRef;
        const idempotencyKey = crypto.randomUUID();

        const { data: withdrawal, error: insertErr } = await admin
          .from("withdrawals")
          .insert({
            user_id: userId,
            amount,
            fee,
            currency: "NGN",
            withdrawal_type: withdrawalType,
            narration: narration || null,
            bank_code: bankCode,
            bank_name: bankName,
            account_number: accountNumber,
            account_name: accountName,
            reference,
            external_reference: reference,
            idempotency_key: idempotencyKey,
            status,
          } as any)
          .select("id, reference, status, amount, fee")
          .single();

        if (insertErr) {
          // Refund safely without overwriting the user's balance (handles race conditions).
          try {
            await refundBalanceByAmount({ admin, userId, amount: totalDebit });
          } catch (refundErr: any) {
            console.error("/api/withdraw refund error", {
              userId,
              amount: totalDebit,
              message: String(refundErr?.message ?? refundErr),
            });
          }

          console.error("/api/withdraw insert error", insertErr.message);

          // If DB enforces uniqueness for active withdrawals, return the existing one.
          if (/duplicate|unique/i.test(insertErr.message)) {
            const { data: existing } = await admin
              .from("withdrawals")
              .select("id,reference,status,created_at")
              .eq("user_id", userId)
              .eq("reference", reference)
              .limit(1);

            return NextResponse.json(
              {
                error: "Duplicate submission.",
                existing_withdrawal: existing?.[0] ?? null,
              },
              { status: 409 },
            );
          }

          return NextResponse.json({ error: "Failed to create withdrawal request" }, { status: 500 });
        }

        const isReview = status === "review_required";
        const { error: notifErr } = await admin.from("notifications").insert({
          user_id: userId,
          title: isReview ? "Withdrawal Under Review" : "Withdrawal Pending",
          message: isReview
            ? `Your withdrawal of ₦${amount.toLocaleString()} is under review. Withdrawals above ₦100,000 require admin approval before processing.`
            : `Your withdrawal of ₦${amount.toLocaleString()} to ${accountName} (${bankName}) has been submitted and is being processed.`,
          notification_type: isReview ? "withdrawal_review" : "withdrawal_pending",
          read: false,
          status: "pending",
        });

        if (notifErr) {
          console.error("/api/withdraw notification insert error", { message: notifErr.message });
        } else {
          try {
            await incrementUnreadNotifications({ admin, userId, delta: 1 });
          } catch (e: any) {
            console.error("/api/withdraw unread_notifications increment error", {
              userId,
              message: String(e?.message ?? e),
            });
          }
        }

        return NextResponse.json({ ok: true, withdrawal });
      });
    } catch (e: any) {
      if (e?.code === "LOCK_UNAVAILABLE" || e?.message === "lock_unavailable") {
        return NextResponse.json(
          { error: "Withdrawal system temporarily unavailable. Please try again." },
          { status: 503 },
        );
      }

      if (e?.code === "WORKER_ALREADY_RUNNING" || e?.message === "worker_already_running") {
        return NextResponse.json(
          { error: "Withdrawal request already in progress. Please wait." },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (e: any) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/withdraw unhandled error", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
