import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const COIN_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  BNB: "binancecoin",
} as const;

type Market = {
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number | null;
};

async function fetchMarkets(): Promise<Record<string, Market>> {
  const apiKey = process.env.COINGECKO_API_KEY;
  const ids = Object.values(COIN_IDS).join(",");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
    ids
  )}&order=market_cap_desc&per_page=4&page=1&sparkline=false&price_change_percentage=24h`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: apiKey
      ? {
          "x-cg-demo-api-key": apiKey,
        }
      : undefined,
  });

  if (!res.ok) {
    throw new Error(`CoinGecko request failed: ${res.status}`);
  }

  const arr = (await res.json()) as Market[];
  const bySym = new Map<string, Market>();

  for (const m of arr) {
    bySym.set(m.symbol.toLowerCase(), m);
  }

  const out: Record<string, Market> = {};
  const btc = bySym.get("btc");
  const eth = bySym.get("eth");
  const usdt = bySym.get("usdt");
  const bnb = bySym.get("bnb");

  if (btc) out.BTC = btc;
  if (eth) out.ETH = eth;
  if (usdt) out.USDT = usdt;
  if (bnb) out.BNB = bnb;

  return out;
}

export async function GET() {
  try {
    const markets = await fetchMarkets();
    const supabase = await createSupabaseServerClient();
    const { data: ratesRow } = await supabase
      .from("admin_rates")
      .select("usdt_rate, btc_rate, eth_rate, bnb_rate")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const nairaRates: Record<string, number> = {
      USDT: Number(ratesRow?.usdt_rate ?? 1650),
      BTC: Number(ratesRow?.btc_rate ?? 1640),
      ETH: Number(ratesRow?.eth_rate ?? 1640),
      BNB: Number(ratesRow?.bnb_rate ?? 1610),
    };

    return NextResponse.json({ markets, updatedAt: new Date().toISOString(), nairaRates });
  } catch {
    return NextResponse.json(
      { markets: {}, updatedAt: new Date().toISOString() },
      { status: 200 }
    );
  }
}
