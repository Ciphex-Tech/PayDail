import { NextResponse } from "next/server";
import axios from "axios";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Asset = "USDT" | "BTC" | "ETH" | "BNB";

type Network = "TRC20" | "BTC" | "ETH" | "BEP20";

const SUPPORTED: Record<Asset, Network[]> = {
  USDT: ["TRC20"],
  BTC: ["BTC"],
  ETH: ["ETH"],
  BNB: ["BEP20"],
};

function getColumn(asset: Asset, network: Network) {
  if (asset === "USDT" && network === "TRC20") return "usdt_deposit_address_trc20";
  if (asset === "BTC" && network === "BTC") return "btc_deposit_address";
  if (asset === "ETH" && network === "ETH") return "eth_deposit_address";
  if (asset === "BNB" && network === "BEP20") return "bnb_deposit_address_bep20";
  return null;
}

function getBitgoConfig(asset: Asset) {
  const baseUrl = process.env.BITGO_COIN_BASE_URL;

  const secretKey = process.env.BITGO_SECRET_KEY;
  if (!baseUrl || !secretKey) {
    throw new Error("BitGo env vars missing");
  }

  const walletIdByAsset: Record<Asset, string | undefined> = {
    BTC: process.env.BITGO_WALLET_ID_BTC,
    ETH: process.env.BITGO_WALLET_ID_ETH,
    USDT: process.env.BITGO_WALLET_ID_USDT,
    BNB: process.env.BITGO_WALLET_ID_BNB,
  };

  const coinByAsset: Record<Asset, string | undefined> = {
    BTC: process.env.BITGO_COIN_BTC,
    ETH: process.env.BITGO_COIN_ETH,
    USDT: process.env.BITGO_COIN_USDT,
    BNB: process.env.BITGO_COIN_BNB,
  };

  const walletId = walletIdByAsset[asset];
  const coin = coinByAsset[asset];

  if (!walletId || !coin) {
    throw new Error(`BitGo wallet/coin missing for ${asset}`);
  }

  return { baseUrl, secretKey, walletId, coin };
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = data.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const asset = (body as any)?.asset as Asset | undefined;
  const network = (body as any)?.network as Network | undefined;

  if (!asset || !network || !(asset in SUPPORTED) || !SUPPORTED[asset].includes(network)) {
    return NextResponse.json({ error: "Unsupported asset/network" }, { status: 400 });
  }

  const column = getColumn(asset, network);
  if (!column) {
    return NextResponse.json({ error: "Unsupported asset/network" }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await supabase
    .from("users_info")
    .select(`id, ${column}`)
    .eq("id", userId)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: "Failed to load user info" }, { status: 500 });
  }

  const existingAddress = (existing as any)?.[column] as string | null | undefined;
  if (existingAddress) {
    return NextResponse.json({ address: existingAddress, saved: true, reused: true });
  }

  try {
    const { baseUrl, secretKey, walletId, coin } = getBitgoConfig(asset);

    const url = `${baseUrl}/api/v2/${coin}/wallet/${walletId}/address`;

    const resp = await axios.post(
      url,
      {
        label: userId,
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const address = resp?.data?.address as string | undefined;

    if (!address) {
      return NextResponse.json({ error: "BitGo did not return an address" }, { status: 502 });
    }

    const { error: upsertErr } = await supabase
      .from("users_info")
      .upsert({ id: userId, [column]: address }, { onConflict: "id" });

    if (upsertErr) {
      return NextResponse.json({ error: "Failed to save address" }, { status: 500 });
    }

    return NextResponse.json({ address, saved: true, reused: false });
  } catch (e: any) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status;
      const data = e.response?.data;
      console.error("[wallet/generate-address] BitGo error", {
        asset,
        network,
        baseUrl: process.env.BITGO_COIN_BASE_URL,
        coin: (process.env[`BITGO_COIN_${asset}` as const] as string | undefined) ?? null,
        walletId: (process.env[`BITGO_WALLET_ID_${asset}` as const] as string | undefined) ?? null,
        status,
        data,
      });

      return NextResponse.json(
        {
          error: "Failed to generate address",
          code: "BITGO_ERROR",
          status: status ?? null,
        },
        { status: 502 }
      );
    }

    console.error("[wallet/generate-address] Unexpected error", {
      asset,
      network,
      message: e?.message,
    });

    return NextResponse.json(
      {
        error: "Failed to generate address",
        code: "UNKNOWN_ERROR",
      },
      { status: 500 }
    );
  }
}
