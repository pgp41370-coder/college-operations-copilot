import Link from "next/link";
import { History } from "lucide-react";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { AUDIT_LABELS } from "@/lib/audit-labels";
import { Card, cx, EmptyState, PageHeader, Timeline, type Tone } from "@/components/ui";

export const metadata = { title: "Audit log" };

const CATEGORIES: [string, string, string[]][] = [
  ["", "All", []],
  ["activity", "Activities", ["activity", "feedback"]],
  ["documents", "Documents", ["source", "extraction", "ai"]],
  ["fields", "Fields", ["field"]],
  ["attendance", "Attendance", ["attendance", "reconciliation"]],
  ["reports", "Reports & exports", ["report", "export"]],
  ["access", "Access & admin", ["auth", "account", "user", "template"]],
];

const toneOf = (action: string): Tone =>
  action.includes("approved") ? "success" : action.includes("failed") || action.includes("deleted") || action.includes("reopen") ? "danger" : action.includes("conflict") ? "warning" : action.startsWith("field") ? "brand" : "neutral";

function describe(d: Record<string, unknown> | null): string | undefined {
  if (!d) return undefined;
  const parts = Object.entries(d)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${k.replace(/_/g, " ")}: ${val.length > 120 ? `${val.slice(0, 120)}…` : val}`;
    });
  return parts.length ? parts.join(" · ") : undefined;
}

export default async function AuditPage(props: { searchParams: Promise<{ type?: string }> }) {
  const user = await requirePageUser();
  const { type } = await props.searchParams;
  const cat = CATEGORIES.some(([k]) => k === type) ? (type ?? "") : "";
  const prefixes = CATEGORIES.find(([k]) => k === cat)?.[2] ?? [];
  const sql = getSql();
  const rows = await sql<{ id: string; action: string; created_at: Date; actor_name: string | null; activity_id: string | null; title: string | null; entity_type: string | null; details: Record<string, unknown> }[]>`
    select l.id::text, l.action, l.created_at, u.name as actor_name, l.activity_id, a.display_title as title, l.entity_type, l.details
    from audit_logs l left join users u on u.id = l.actor_id left join activities a on a.id = l.activity_id
    where (${user.role === "admin"} or l.actor_id = ${user.id} or a.owner_id = ${user.id})
      and (${prefixes.length === 0} or split_part(l.action, '.', 1) = any(${prefixes}::text[]))
    order by l.created_at desc limit 300`;
  return (
    <>
      <PageHeader title="Audit log" description={user.role === "admin" ? "All recorded actions (latest 300). Entries are append-only." : "Actions by you or on your activities (latest 300). Entries are append-only."} />
      <nav aria-label="Filter by type" className="scroll-thin mb-4 flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5 sm:inline-flex">
        {CATEGORIES.map(([k, l]) => (
          <Link key={k || "all"} href={k ? `/audit?type=${k}` : "/audit"} aria-current={cat === k ? "page" : undefined} className={cx("focus-ring shrink-0 rounded-md px-2.5 py-1 text-[12.5px]", cat === k ? "bg-surface font-medium shadow-xs ring-1 ring-line" : "text-muted hover:text-foreground")}>
            {l}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={History} title="No recorded actions">Nothing matches this filter yet.</EmptyState>
      ) : (
        <Card className="p-5">
          <Timeline
            items={rows.map((r) => ({
              id: r.id,
              at: r.created_at,
              actor: r.actor_name ?? "System",
              action: AUDIT_LABELS[r.action] ?? r.action,
              tone: toneOf(r.action),
              entity: r.activity_id ? (
                <Link className="hover:text-brand hover:underline" href={`/activities/${r.activity_id}?tab=audit`}>
                  {r.title ?? "Untitled activity"}
                </Link>
              ) : r.entity_type ? (
                <span className="text-muted">{r.entity_type}</span>
              ) : undefined,
              detail: describe(r.details),
            }))}
          />
        </Card>
      )}
    </>
  );
}
