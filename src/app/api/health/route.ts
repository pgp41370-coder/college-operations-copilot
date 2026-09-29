import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { aiStatus } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

/** Liveness + database connectivity. Reveals no configuration values. */
export async function GET() {
  let database: "connected" | "unavailable" = "unavailable";
  let migrated = false;
  try {
    const sql = getSql();
    await sql`select 1`;
    database = "connected";
    const [t] = await sql<{ n: number }[]>`select count(*)::int as n from templates`;
    migrated = t.n > 0;
  } catch {
    database = "unavailable";
  }
  return NextResponse.json(
    { ok: database === "connected" && migrated, database, migrated, ai: aiStatus().mode },
    { status: database === "connected" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
