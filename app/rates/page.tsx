import { redirect } from "next/navigation";
import Sidebar from "@/app/dashboard/Sidebar";
import PageHeader from "@/app/dashboard/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import RatesContent from "@/app/rates/RatesContent";
import { isAdminEmail } from "@/lib/security/isAdminEmail";

export default async function RatesPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/login");
  }

  const user = data.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const fullNameFromMeta =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.fullName === "string" && meta.fullName.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    null;

  const first = typeof meta.firstName === "string" ? meta.firstName : "";
  const last = typeof meta.lastName === "string" ? meta.lastName : "";
  const combined = `${first} ${last}`.trim();

  const fullName = fullNameFromMeta || combined || user.email || "there";
  const email = user.email || "";
  const isAdmin = isAdminEmail(email);

  const COIN_IDS = {
    BTC: "bitcoin",
    ETH: "ethereum",
    USDT: "tether",
    BNB: "binancecoin",
  } as const;

  const { data: ratesRow } = await supabase
    .from("admin_rates")
    .select("usdt_rate, btc_rate, eth_rate, bnb_rate")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const nairaPerUsdBySymbol: Record<string, number> = {
    USDT: Number(ratesRow?.usdt_rate ?? 1650),
    BTC: Number(ratesRow?.btc_rate ?? 1640),
    ETH: Number(ratesRow?.eth_rate ?? 1640),
    BNB: Number(ratesRow?.bnb_rate ?? 1610),
  };

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
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=4&page=1&sparkline=false&price_change_percentage=24h`;

    const res = await fetch(url, {
      cache: "no-store",
      next: { revalidate: 60 },
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
    const byId = new Map<string, Market>();
    for (const m of arr) {
      byId.set(m.symbol.toLowerCase(), m);
    }

    const out: Record<string, Market> = {};
    const btc = byId.get("btc");
    const eth = byId.get("eth");
    const usdt = byId.get("usdt");
    const bnb = byId.get("bnb");
    if (btc) out.BTC = btc;
    if (eth) out.ETH = eth;
    if (usdt) out.USDT = usdt;
    if (bnb) out.BNB = bnb;
    return out;
  }

  const markets = await fetchMarkets();
  const updatedAtIso = new Date().toISOString();

  return (
    <div className="min-h-screen w-full bg-[#0B0A0F] text-white">
      <div className="flex min-h-screen">
        <Sidebar active="rates" isAdmin={isAdmin} />

        <main className="flex-1 flex h-screen flex-col overflow-hidden">
          <PageHeader title="Rates" fullName={fullName} email={email} />

          <div className="flex-1 overflow-y-auto">
            <RatesContent
              initialMarkets={markets}
              initialUpdatedAtIso={updatedAtIso}
              initialNairaRates={nairaPerUsdBySymbol}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
