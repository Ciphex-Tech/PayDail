import { NextResponse } from "next/server";

export function isWorkerAuthorized(req: Request): boolean {
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? "";

  const expected = process.env.WORKER_SECRET || process.env.CRON_SECRET || "";
  if (!expected) return false;

  return provided === expected;
}

export function unauthorizedWorkerResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
