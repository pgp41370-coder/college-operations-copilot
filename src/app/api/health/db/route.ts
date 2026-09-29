import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { schemaStatus } from "@/lib/server/schema-status";

export const dynamic = "force-dynamic";

/** Database + migration health. Reports counts and names only — never configuration values. */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, database: "not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const started = Date.now();
    const status = await schemaStatus(getSql());
    const ok = status.migrations === "current" && status.missingTables.length === 0 && status.templatesSeeded > 0;
    return NextResponse.json(
      { ok, database: "connected", queryMs: Date.now() - started, ...status },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
