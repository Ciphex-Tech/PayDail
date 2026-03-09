import { NextResponse } from "next/server";

import { listBanks } from "@/lib/paystack/client";

export const revalidate = 3600;

export async function GET() {
  try {
    const banks = await listBanks();
    return NextResponse.json({ banks });
  } catch (e: any) {
    console.error("/api/paystack/banks error", e?.message);
    return NextResponse.json({ banks: [], error: "Failed to fetch banks" }, { status: 500 });
  }
}
