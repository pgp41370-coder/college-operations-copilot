import type { Db } from "./types";

/** Tables created by db/migrations (kept in sync by tests/unit/schema-status.test.ts). */
export const EXPECTED_TABLES = [
  "activities",
  "activity_feedback",
  "activity_fields",
  "attendance_records",
  "audit_logs",
  "field_candidates",
  "generated_reports",
  "rate_limit_events",
  "sessions",
  "source_blobs",
  "source_extractions",
  "sources",
  "templates",
  "users",
] as const;

/** Latest migration file in db/migrations. */
export const LATEST_MIGRATION = "002_feedback.sql";

export interface SchemaStatus {
  migrations: "current" | "pending" | "missing";
  latestApplied: string | null;
  expectedLatest: string;
  tablesExpected: number;
  tablesPresent: number;
  missingTables: string[];
  indexes: number;
  foreignKeys: number;
  checkConstraints: number;
  templatesSeeded: number;
}

/** Read-only schema health. Reveals no configuration or data. */
export async function schemaStatus(sql: Db): Promise<SchemaStatus> {
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
  const present = new Set(tables.map((t) => t.table_name));
  const missingTables = EXPECTED_TABLES.filter((t) => !present.has(t));
  let latestApplied: string | null = null;
  if (present.has("schema_migrations")) {
    const [m] = await sql<{ name: string }[]>`select name from schema_migrations order by name desc limit 1`;
    latestApplied = m?.name ?? null;
  }
  const [c] = await sql<{ indexes: number; fks: number; checks: number }[]>`
    select
      (select count(*)::int from pg_indexes where schemaname = 'public') as indexes,
      (select count(*)::int from information_schema.table_constraints where constraint_schema = 'public' and constraint_type = 'FOREIGN KEY') as fks,
      (select count(*)::int from pg_constraint k join pg_namespace n on n.oid = k.connamespace where n.nspname = 'public' and k.contype = 'c') as checks`;
  let templatesSeeded = 0;
  if (present.has("templates")) {
    const [t] = await sql<{ n: number }[]>`select count(*)::int as n from templates`;
    templatesSeeded = t.n;
  }
  return {
    migrations: latestApplied == null ? "missing" : latestApplied >= LATEST_MIGRATION ? "current" : "pending",
    latestApplied,
    expectedLatest: LATEST_MIGRATION,
    tablesExpected: EXPECTED_TABLES.length,
    tablesPresent: EXPECTED_TABLES.length - missingTables.length,
    missingTables,
    indexes: c.indexes,
    foreignKeys: c.fks,
    checkConstraints: c.checks,
    templatesSeeded,
  };
}
