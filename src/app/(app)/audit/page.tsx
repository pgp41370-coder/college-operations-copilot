import Link from "next/link";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { AUDIT_LABELS } from "@/lib/audit-labels";
import { fmtDateTime, PageHeader } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const user = await requirePageUser();
  const rows = await getSql()<{ id: string; action: string; created_at: Date; actor_name: string | null; activity_id: string | null; title: string | null; entity_type: string | null; details: Record<string, unknown> }[]>`
    select l.id::text, l.action, l.created_at, u.name as actor_name, l.activity_id, a.display_title as title, l.entity_type, l.details
    from audit_logs l left join users u on u.id = l.actor_id left join activities a on a.id = l.activity_id
    where ${user.role === "admin"} or l.actor_id = ${user.id} or a.owner_id = ${user.id}
    order by l.created_at desc limit 300`;
  return (
    <>
      <PageHeader title="Audit log" description={user.role === "admin" ? "All recorded actions (latest 300)." : "Actions by you or on your activities (latest 300)."} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-muted">{fmtDateTime(r.created_at)}</td>
                <td className="whitespace-nowrap">{r.actor_name ?? "System"}</td>
                <td className="whitespace-nowrap font-medium">{AUDIT_LABELS[r.action] ?? r.action}</td>
                <td>{r.activity_id ? <Link className="text-brand hover:underline" href={`/activities/${r.activity_id}?tab=history`}>{r.title ?? "Untitled activity"}</Link> : <span className="text-muted">{r.entity_type ?? "—"}</span>}</td>
                <td className="max-w-md break-words font-mono text-xs text-muted">{JSON.stringify(r.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
