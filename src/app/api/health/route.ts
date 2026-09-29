import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { aiStatus } from "@/lib/ai/provider";
import { LATEST_MIGRATION } from "@/lib/server/schema-status";

export const dynamic = "force-dynamic";

/** Liveness + database connectivity. Reveals no configuration values. */
export async function GET() {
  let database: "connected" | "unavailable" | "not_configured" = process.env.DATABASE_URL ? "unavailable" : "not_configured";
  let migrated = false;
  let migrations: "current" | "pending" | "missing" | "unknown" = "unknown";
  try {
    const sql = getSql();
    await sql`select 1`;
    database = "connected";
    const [m] = await sql<{ name: string | null }[]>`
      select (select name from schema_migrations order by name desc limit 1) as name`.catch(() => [{ name: null }]);
    migrations = m?.name == null ? "missing" : m.name >= LATEST_MIGRATION ? "current" : "pending";
    const [t] = await sql<{ n: number }[]>`select count(*)::int as n from templates`.catch(() => [{ n: 0 }]);
    migrated = migrations === "current" && t.n > 0;
  } catch {
    if (database !== "not_configured") database = "unavailable";
  }
  return NextResponse.json(
    { ok: database === "connected" && migrated, database, migrated, migrations, ai: aiStatus().mode },
    { status: database === "connected" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
