import { NextResponse } from "next/server";
import axios from "axios";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  BNB: "binancecoin",
};

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;

type PriceCacheEntry = { usd: number; fetchedAt: number };

function getPriceCache(): Record<string, PriceCacheEntry> {
  const g = globalThis as any;
  if (!g.__PAYDAIL_PRICE_CACHE__) g.__PAYDAIL_PRICE_CACHE__ = {};
  return g.__PAYDAIL_PRICE_CACHE__ as Record<string, PriceCacheEntry>;
}

type BitGoPayload = Record<string, any>;

type ParsedEvent = {
  coin: string;
  txid: string | null;
  transferId: string | null;
  entries: Array<{ address: string; value: number | string | null }>;
  state: string | null;
  date: string | null;
};

function asEntry(address: unknown, value: unknown) {
  const a = typeof address === "string" ? address : null;
  if (!a) return null;
  const v = typeof value === "number" || typeof value === "string" ? value : null;
  return { address: a, value: v };
}

function parseBitGoEvent(body: BitGoPayload): ParsedEvent {
  const coin =
    (typeof body.coin === "string" && body.coin) ||
    (typeof body?.transfer?.coin === "string" && body.transfer.coin) ||
    "";

  const transfer = body?.transfer;

  const txid =
    (typeof transfer?.txid === "string" && transfer.txid) ||
    (typeof transfer?.transactionHash === "string" && transfer.transactionHash) ||
    (typeof body?.txid === "string" && body.txid) ||
    (typeof body?.hash === "string" && body.hash) ||
    null;

  const transferId =
    (typeof transfer === "string" && transfer) ||
    (typeof transfer?.id === "string" && transfer.id) ||
    (typeof body?.transferId === "string" && body.transferId) ||
    null;

  const state =
    (typeof transfer?.state === "string" && transfer.state) ||
    (typeof body?.state === "string" && body.state) ||
    null;

  const date =
    (typeof transfer?.date === "string" && transfer.date) ||
    (typeof body?.date === "string" && body.date) ||
    null;

  const entries: Array<{ address: string; value: number | string | null }> = [];

  // Primary: BitGo transfer entries
  if (Array.isArray(transfer?.entries)) {
    for (const e of transfer.entries) {
      const entry = asEntry(e?.address, e?.value);
      if (entry) entries.push(entry);
    }
  }

  // Some payloads use outputs array
  if (!entries.length && Array.isArray(transfer?.outputs)) {
    for (const o of transfer.outputs) {
      const entry = asEntry(o?.address, o?.value ?? o?.amount);
      if (entry) entries.push(entry);
    }
  }

  // Some payloads use recipients array
  if (!entries.length && Array.isArray(transfer?.recipients)) {
    for (const r of transfer.recipients) {
      const entry = asEntry(r?.address, r?.value ?? r?.amount);
      if (entry) entries.push(entry);
    }
  }

  // Fallback: single destination fields
  if (!entries.length) {
    const destAddress = transfer?.toAddress ?? transfer?.address ?? body?.address ?? body?.toAddress;
    const destValue = transfer?.value ?? transfer?.amount ?? body?.value ?? body?.amount;
    const entry = asEntry(destAddress, destValue);
    if (entry) entries.push(entry);
  }

  return { coin, txid, transferId, entries, state, date };
}

function guessAssetFromCoin(coin: string): "BTC" | "ETH" | "USDT" | "BNB" | null {
  const c = (coin || "").toLowerCase();
  if (c.includes("btc")) return "BTC";
  if (c.includes("eth")) return "ETH";
  if (c.includes("usdt") || c.includes("tether")) return "USDT";
  // BitGo uses bsc/tbsc for Binance Smart Chain coins.
  if (c.includes("bsc") || c === "tbsc" || c === "bsc") return "BNB";
  if (c.includes("bnb")) return "BNB";
  return null;
}

function resolveAssetFromEnvOrGuess(coin: string): "BTC" | "ETH" | "USDT" | "BNB" | null {
  const c = (coin || "").toLowerCase();

  const envMap: Array<["BTC" | "ETH" | "USDT" | "BNB", string | undefined]> = [
    ["BTC", process.env.BITGO_COIN_BTC],
    ["ETH", process.env.BITGO_COIN_ETH],
    ["USDT", process.env.BITGO_COIN_USDT],
    ["BNB", process.env.BITGO_COIN_BNB],
  ];

  for (const [asset, envCoin] of envMap) {
    if (typeof envCoin === "string" && envCoin.toLowerCase() === c) return asset;
  }

  return guessAssetFromCoin(coin);
}

function getBitGoConfigFromCoin(coin: string) {
  const baseUrl = process.env.BITGO_COIN_BASE_URL;
  const secretKey = process.env.BITGO_SECRET_KEY;
  if (!baseUrl || !secretKey) throw new Error("BitGo env vars missing");

  const asset = resolveAssetFromEnvOrGuess(coin);
  if (!asset) throw new Error(`Unsupported BitGo coin: ${coin}`);

  const walletIdByAsset: Record<string, string | undefined> = {
    BTC: process.env.BITGO_WALLET_ID_BTC,
    ETH: process.env.BITGO_WALLET_ID_ETH,
    USDT: process.env.BITGO_WALLET_ID_USDT,
    BNB: process.env.BITGO_WALLET_ID_BNB,
  };

  const walletId = walletIdByAsset[asset];
  if (!walletId) throw new Error(`Missing BITGO_WALLET_ID for ${asset}`);

  return { baseUrl, secretKey, walletId, asset };
}

async function fetchCoinUsdPrice(asset: "BTC" | "ETH" | "USDT" | "BNB") {
  if (asset === "USDT") return 1;
  const cache = getPriceCache();
  const cached = cache[asset];
  const now = Date.now();
  if (cached && Number.isFinite(cached.usd) && now - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached.usd;
  }

  const id = COINGECKO_IDS[asset];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`CoinGecko price failed: ${res.status}`);
    const json = (await res.json()) as any;
    const usd = Number(json?.[id]?.usd);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error("CoinGecko price invalid");

    cache[asset] = { usd, fetchedAt: now };
    return usd;
  } catch (e) {
    if (cached && Number.isFinite(cached.usd)) {
      return cached.usd;
    }
    throw e;
  }
}

async function fetchAdminNairaPerUsdRate(supabase: ReturnType<typeof createSupabaseAdminClient>, asset: "BTC" | "ETH" | "USDT" | "BNB") {
  const { data: ratesRow, error } = await supabase
    .from("admin_rates")
    .select("usdt_rate, btc_rate, eth_rate, bnb_rate")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const map: Record<typeof asset, number> = {
    USDT: Number(ratesRow?.usdt_rate ?? 1650),
    BTC: Number(ratesRow?.btc_rate ?? 1640),
    ETH: Number(ratesRow?.eth_rate ?? 1640),
    BNB: Number(ratesRow?.bnb_rate ?? 1610),
  };
  const v = map[asset];
  if (!Number.isFinite(v) || v <= 0) throw new Error("Admin rate invalid");
  return v;
}

async function fetchTransferDetails(coin: string, transferId: string) {
  const { baseUrl, secretKey, walletId } = getBitGoConfigFromCoin(coin);
  const url = `${baseUrl}/api/v2/${coin}/wallet/${walletId}/transfer/${transferId}`;
  const resp = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
    timeout: 15000,
  });
  return resp.data;
}

function extractEntriesFromTransfer(transfer: any): Array<{ address: string; value: number | string | null }> {
  const out: Array<{ address: string; value: number | string | null }> = [];

  if (Array.isArray(transfer?.entries)) {
    for (const e of transfer.entries) {
      const entry = asEntry(e?.address, e?.value);
      if (entry) out.push(entry);
    }
  }

  if (!out.length && Array.isArray(transfer?.outputs)) {
    for (const o of transfer.outputs) {
      const entry = asEntry(o?.address, o?.value ?? o?.amount);
      if (entry) out.push(entry);
    }
  }

  if (!out.length && Array.isArray(transfer?.recipients)) {
    for (const r of transfer.recipients) {
      const entry = asEntry(r?.address, r?.value ?? r?.amount);
      if (entry) out.push(entry);
    }
  }

  if (!out.length) {
    const entry = asEntry(transfer?.toAddress ?? transfer?.address, transfer?.value ?? transfer?.amount);
    if (entry) out.push(entry);
  }

  return out;
}

function normalizeStatus(state: string | null) {
  const s = (state ?? "").toLowerCase();
  if (!s) return "pending";
  // BitGo may send "unconfirmed" which contains the substring "confirmed".
  // Treat these as pending.
  if (s.includes("unconfirmed") || s.includes("unconfirm")) return "pending";
  if (s.includes("pending")) return "pending";
  if (s.includes("complete") || s.includes("completed")) return "completed";
  if (s.includes("confirmed")) return "confirmed";
  if (s.includes("failed") || s.includes("rejected")) return "failed";
  return "pending";
}

function normalizeAmountFromEntryValue(coin: string, value: number) {
  const asset = resolveAssetFromEnvOrGuess(coin);
  // BitGo returns BTC values in satoshis for UTXO coins (btc/tbtc). Convert to BTC.
  if (asset === "BTC") return value / 1e8;
  // EVM chains typically return base units (wei) for native amounts.
  if (asset === "ETH" || asset === "BNB") return value / 1e18;
  return value;
}

export async function GET(req: Request) {
  return NextResponse.json({ ok: true, route: "/api/bitgo/webhook" });
}

export async function POST(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const secretFromQuery = urlObj.searchParams.get("secret");

    console.info("/api/bitgo/webhook received request", {
      method: req.method,
      url: req.url,
      hasSecretHeader: Boolean(req.headers.get("x-bitgo-webhook-secret")),
      hasSecretQuery: Boolean(secretFromQuery),
      contentType: req.headers.get("content-type"),
      host: req.headers.get("host"),
      xForwardedHost: req.headers.get("x-forwarded-host"),
      xForwardedProto: req.headers.get("x-forwarded-proto"),
    });

    const secret = process.env.BITGO_WEBHOOK_SECRET;
    if (!secret) {
      console.error("/api/bitgo/webhook missing BITGO_WEBHOOK_SECRET env var");
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    const body = (await req.json()) as BitGoPayload;
    const secretFromBody = typeof body?.secret === "string" ? body.secret : null;
    const provided = req.headers.get("x-bitgo-webhook-secret") || secretFromQuery || secretFromBody;

    if (!provided || provided !== secret) {
      console.warn("/api/bitgo/webhook unauthorized", {
        url: req.url,
        hasSecretHeader: Boolean(provided),
        hasSecretQuery: Boolean(secretFromQuery),
        hasSecretBody: Boolean(secretFromBody),
      });
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    let parsed = parseBitGoEvent(body);

    if (!parsed.entries.length && parsed.transferId) {
      try {
        const transfer = await fetchTransferDetails(parsed.coin, parsed.transferId);
        const fetchedEntries = extractEntriesFromTransfer(transfer);
        if (fetchedEntries.length) {
          parsed = { ...parsed, entries: fetchedEntries };
        }
      } catch (e: any) {
        console.error("/api/bitgo/webhook failed to fetch transfer details", {
          coin: parsed.coin,
          transferId: parsed.transferId,
          message: e?.message,
          status: axios.isAxiosError(e) ? e.response?.status : null,
          data: axios.isAxiosError(e) ? e.response?.data : null,
        });
      }
    }

    if (!parsed.entries.length) {
      const transfer = (body as any)?.transfer;
      console.error("/api/bitgo/webhook no entries", {
        coin: parsed.coin,
        transferId: parsed.transferId,
        txid: parsed.txid,
        transferType: typeof transfer,
        transferValue: typeof transfer === "string" ? transfer : null,
        bodyKeys: Object.keys(body || {}),
        transferKeys: transfer && typeof transfer === "object" ? Object.keys(transfer) : null,
      });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const supabase = createSupabaseAdminClient();

    // For each address in the event, check if it belongs to a user.
    for (const entry of parsed.entries) {
      const address = entry.address;

      const { data: userInfo, error: userErr } = await supabase
        .from("users_info")
        .select("id, notify_transactions, usdt_deposit_address_trc20, btc_deposit_address, eth_deposit_address, bnb_deposit_address_bep20")
        .or(
          `usdt_deposit_address_trc20.eq.${address},btc_deposit_address.eq.${address},eth_deposit_address.eq.${address},bnb_deposit_address_bep20.eq.${address}`,
        )
        .maybeSingle();

      if (userErr) {
        console.error("/api/bitgo/webhook users_info lookup error", { message: userErr.message, address });
        continue;
      }

      if (!userInfo?.id) {
        continue;
      }

      const matchedNetwork =
        userInfo.usdt_deposit_address_trc20 === address
          ? "TRC20"
          : userInfo.btc_deposit_address === address
            ? "BTC"
            : userInfo.eth_deposit_address === address
              ? "ETH"
              : userInfo.bnb_deposit_address_bep20 === address
                ? "BEP20"
                : null;

      const status = normalizeStatus(parsed.state);
      const reference = parsed.transferId || (parsed.txid ? `TX_${parsed.txid.slice(0, 10)}` : `TX_${Date.now()}`);

      const createdAt = parsed.date && !Number.isNaN(new Date(parsed.date).getTime()) ? parsed.date : new Date().toISOString();

      const amount =
        typeof entry.value === "number"
          ? entry.value
          : typeof entry.value === "string"
            ? Number(entry.value)
            : 0;

      const normalizedAmount = normalizeAmountFromEntryValue(parsed.coin, Number.isFinite(amount) ? amount : 0);

      const resolvedAsset = resolveAssetFromEnvOrGuess(parsed.coin);
      const asset = resolvedAsset || "USDT";
      let nairaAmount = 0;
      const feeRate = 0.01;
      try {
        const nairaPerUsd = await fetchAdminNairaPerUsdRate(supabase, asset);
        const usdPrice = await fetchCoinUsdPrice(asset);
        nairaAmount = (Number.isFinite(normalizedAmount) ? normalizedAmount : 0) * usdPrice * nairaPerUsd;
      } catch (e: any) {
        console.error("/api/bitgo/webhook naira conversion error", {
          coin: parsed.coin,
          message: e?.message,
        });
      }

      const nairaAfterFee = Number.isFinite(nairaAmount) && nairaAmount > 0 ? nairaAmount * (1 - feeRate) : 0;

      const { data: existingDeposit, error: upsertErr } = await supabase
        .from("deposits")
        .select("id, naira_amount, status")
        .eq("transaction_hash", parsed.txid)
        .limit(1)
        .maybeSingle();

      if (upsertErr) {
        console.error("/api/bitgo/webhook deposit lookup error", {
          message: upsertErr.message,
          address,
          txid: parsed.txid,
        });
        continue;
      }

      const payload = {
        user_id: userInfo.id,
        reference,
        type: "Deposit",
        amount: Number.isFinite(normalizedAmount) ? normalizedAmount : 0,
        naira_amount: Number.isFinite(nairaAfterFee) ? nairaAfterFee : 0,
        status,
        created_at: createdAt,
        address,
        coin: (parsed.coin || "").toUpperCase(),
        network: matchedNetwork,
        transaction_hash: parsed.txid,
      };

      const existingNairaAmount = Number(existingDeposit?.naira_amount ?? 0);
      const prevStatus = String((existingDeposit as any)?.status ?? "").toLowerCase();
      const nextStatus = String(status ?? "").toLowerCase();

      const isCreditableStatus = (s: string) =>
        s === "confirmed" || s === "completed" || s === "success";

      const shouldCredit = isCreditableStatus(nextStatus);
      const wasCreditedOrCreditable = isCreditableStatus(prevStatus);

      const nextNaira = Number.isFinite(nairaAfterFee) ? nairaAfterFee : 0;
      const prevNaira = Number.isFinite(existingNairaAmount) ? existingNairaAmount : 0;

      const balanceDelta = !shouldCredit
        ? 0
        : !existingDeposit?.id
          ? nextNaira
          : !wasCreditedOrCreditable
            ? nextNaira
            : nextNaira - prevNaira;

      if (Number.isFinite(balanceDelta) && balanceDelta > 0) {
        const { data: balRow, error: balErr } = await supabase
          .from("users_info")
          .select("naira_balance")
          .eq("id", userInfo.id)
          .maybeSingle();
        if (balErr) {
          console.error("/api/bitgo/webhook balance read error", { message: balErr.message, userId: userInfo.id });
        } else {
          const current = Number(balRow?.naira_balance ?? 0);
          const next = current + balanceDelta;
          const { error: balUpdateErr } = await supabase
            .from("users_info")
            .update({ naira_balance: next })
            .eq("id", userInfo.id);
          if (balUpdateErr) {
            console.error("/api/bitgo/webhook balance update error", { message: balUpdateErr.message, userId: userInfo.id });
          }
        }
      }

      if (existingDeposit?.id) {
        const { error: updateErr } = await supabase.from("deposits").update(payload).eq("id", existingDeposit.id);
        if (updateErr) {
          console.error("/api/bitgo/webhook deposit update error", {
            message: updateErr.message,
            address,
            txid: parsed.txid,
          });
          continue;
        }

        const prevStatus = String((existingDeposit as any)?.status ?? "").toLowerCase();
        const nextStatus = String(status ?? "").toLowerCase();
        if (Boolean((userInfo as any)?.notify_transactions ?? true) && prevStatus && nextStatus && prevStatus !== nextStatus) {
          const coinLabel = (payload.coin || asset).toUpperCase();
          const amountLabel = Number.isFinite(payload.amount) ? payload.amount : 0;
          const title =
            nextStatus === "pending"
              ? "Deposit Pending"
              : nextStatus === "failed"
                ? "Deposit Failed"
                : "Deposit Confirmed";
          const message =
            nextStatus === "failed"
              ? `Your deposit of ${amountLabel} ${coinLabel} failed. If this wasn't expected, contact support.`
              : nextStatus === "pending"
                ? `Your deposit of ${amountLabel} ${coinLabel} is pending confirmation.`
                : `Your deposit of ${amountLabel} ${coinLabel} is confirmed and you have received ₦${Number(payload.naira_amount ?? 0).toLocaleString()}.`;

          const { error: notifErr } = await supabase.from("notifications").insert({
            user_id: userInfo.id,
            title,
            message,
            notification_type: nextStatus === "pending" ? "deposit_pending" : nextStatus === "failed" ? "deposit_failed" : "deposit_confirmed",
            read: false,
            status: nextStatus,
          });
          if (notifErr) {
            console.error("/api/bitgo/webhook notification insert error", {
              message: notifErr.message,
              userId: userInfo.id,
              txid: parsed.txid,
            });
          }
        }
      } else {
        const { error: insertErr } = await supabase.from("deposits").insert(payload);
        if (insertErr) {
          console.error("/api/bitgo/webhook deposit insert error", {
            message: insertErr.message,
            address,
            txid: parsed.txid,
          });
          continue;
        }

        if (Boolean((userInfo as any)?.notify_transactions ?? true)) {
          const coinLabel = (payload.coin || asset).toUpperCase();
          const amountLabel = Number.isFinite(payload.amount) ? payload.amount : 0;
          const nextStatus = String(status ?? "").toLowerCase();
          const title =
            nextStatus === "pending"
              ? "Deposit Pending"
              : nextStatus === "failed"
                ? "Deposit Failed"
                : "Deposit Confirmed";
          const message =
            nextStatus === "failed"
              ? `Your deposit of ${amountLabel} ${coinLabel} failed. If this wasn't expected, contact support.`
              : nextStatus === "pending"
                ? `Your deposit of ${amountLabel} ${coinLabel} is pending confirmation.`
                : `Your deposit of ${amountLabel} ${coinLabel} is confirmed and you have received ₦${Number(payload.naira_amount ?? 0).toLocaleString()}.`;

          const { error: notifErr } = await supabase.from("notifications").insert({
            user_id: userInfo.id,
            title,
            message,
            notification_type: nextStatus === "pending" ? "deposit_pending" : nextStatus === "failed" ? "deposit_failed" : "deposit_confirmed",
            read: false,
            status: nextStatus,
          });
          if (notifErr) {
            console.error("/api/bitgo/webhook notification insert error", {
              message: notifErr.message,
              userId: userInfo.id,
              txid: parsed.txid,
            });
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/bitgo/webhook unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
