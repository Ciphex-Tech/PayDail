import { redirect } from "next/navigation";
import Sidebar from "@/app/dashboard/Sidebar";
import PageHeader from "@/app/dashboard/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import WalletContent from "@/app/wallet/WalletContent";
import { isAdminEmail } from "@/lib/security/isAdminEmail";

type DepositRow = {
  id: string;
  reference: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  address: string;
  coin: string;
  network: string | null;
  transaction_hash: string | null;
};

export default async function WalletPage() {
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

  const { data: info } = await supabase
    .from("users_info")
    .select("usdt_deposit_address_trc20, btc_deposit_address, eth_deposit_address, bnb_deposit_address_bep20")
    .eq("id", user.id)
    .maybeSingle();

  const { data: deposits } = await supabase
    .from("deposits")
    .select(
      "id, reference, type, amount, status, created_at, address, coin, network, transaction_hash"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="min-h-screen w-full bg-[#0B0A0F] text-white">
      <div className="flex min-h-screen">
        <Sidebar active="wallet" isAdmin={isAdmin} />

        <main className="flex-1 flex h-screen flex-col overflow-hidden">
          <PageHeader title="Wallet" fullName={fullName} email={email} />

          <div className="flex-1 overflow-y-auto">
            <WalletContent initialAddresses={info || {}} initialDeposits={(deposits as DepositRow[]) || []} />
          </div>
        </main>
      </div>
    </div>
  );
}
