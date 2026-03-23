import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.text();
    if (process.env.NODE_ENV !== "production") {
      console.log("CSP Violation Report", body);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
