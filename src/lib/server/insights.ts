/**
 * Read-only aggregates for the dashboard. Everything is computed from the
 * database with the same readiness logic the workflow uses — no invented
 * figures, no trends without history.
 */
import type { Issue } from "../readiness";
import type { User } from "./auth-core";
import { computeState, type ActivityRow } from "./activities";
import { schemaStatus } from "./schema-status";
import type { Db } from "./types";

export interface AttentionItem {
  activityId: string;
  title: string | null;
  status: string;
  severity: "critical" | "warning" | "info";
  kind: Issue["code"];
  message: string;
  tab: string;
}

const SEVERITY: Partial<Record<Issue["code"], AttentionItem["severity"]>> = {
  conflict: "critical",
  reconciliation_failed: "critical",
  required_missing: "warning",
  low_confidence: "warning",
  extraction_failed: "warning",
  reports_missing: "info",
  reports_stale: "info",
  extraction_running: "info",
  reconciliation_unverified: "info",
  attendance_missing: "info",
};
const TAB: Partial<Record<Issue["code"], string>> = {
  conflict: "review",
  low_confidence: "review",
  required_missing: "review",
  reconciliation_failed: "attendance",
  reconciliation_unverified: "attendance",
  attendance_missing: "attendance",
  extraction_failed: "evidence",
  extraction_running: "evidence",
  reports_missing: "reports",
  reports_stale: "reports",
};

/** Blocking issues and warnings across the most recently updated open activities. */
export async function attentionItems(sql: Db, user: User, maxActivities = 12): Promise<AttentionItem[]> {
  const rows = await sql<ActivityRow[]>`
    select * from activities
    where status not in ('APPROVED', 'ARCHIVED') and (${user.role === "admin"} or owner_id = ${user.id})
    order by updated_at desc limit ${maxActivities}`;
  const out: AttentionItem[] = [];
  for (const a of rows) {
    const s = await computeState(sql, a);
    for (const i of [...s.blocking, ...s.warnings]) {
      out.push({
        activityId: a.id,
        title: a.display_title,
        status: a.status,
        severity: s.blocking.includes(i) ? (SEVERITY[i.code] === "info" ? "warning" : (SEVERITY[i.code] ?? "warning")) : "info",
        kind: i.code,
        message: i.message,
        tab: TAB[i.code] ?? "overview",
      });
    }
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
}

export async function systemIntegrity(sql: Db, user: User) {
  const started = Date.now();
  const schema = await schemaStatus(sql);
  const dbMs = Date.now() - started;
  const [st] = await sql<{ files: number; bytes: string | null; pages: number }[]>`
    select count(*)::int as files, sum(s.size_bytes)::text as bytes,
      (select count(*)::int from source_extractions e join sources s2 on s2.id = e.source_id join activities a2 on a2.id = s2.activity_id
        where ${user.role === "admin"} or a2.owner_id = ${user.id}) as pages
    from sources s join activities a on a.id = s.activity_id where ${user.role === "admin"} or a.owner_id = ${user.id}`;
  const [ocr] = await sql<{ n: number; mean: string | null }[]>`
    select count(*)::int as n, avg(e.confidence)::text as mean from source_extractions e
    join sources s on s.id = e.source_id join activities a on a.id = s.activity_id
    where e.method = 'ocr' and (${user.role === "admin"} or a.owner_id = ${user.id})`;
  return {
    database: { connected: true, ms: dbMs, migrations: schema.migrations, tables: `${schema.tablesPresent}/${schema.tablesExpected}` },
    storage: { files: st.files, bytes: Number(st.bytes ?? 0), pagesExtracted: st.pages },
    ocr: { pages: ocr.n, meanConfidence: ocr.mean == null ? null : Number(ocr.mean) },
  };
}

export async function pipelineCounts(sql: Db, user: User): Promise<Record<string, number>> {
  const rows = await sql<{ status: string; n: number }[]>`
    select status, count(*)::int as n from activities where ${user.role === "admin"} or owner_id = ${user.id} group by status`;
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
