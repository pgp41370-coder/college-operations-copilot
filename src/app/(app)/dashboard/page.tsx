import Link from "next/link";
import { getSql } from "@/lib/db";
import { listActivities, statusCounts } from "@/lib/server/activities";
import { requirePageUser } from "@/lib/server/auth";
import { AUDIT_LABELS } from "@/lib/audit-labels";
import { EmptyState, fmtDateTime, PageHeader, StatusChip } from "@/components/ui";
import { ActivityTable } from "../activities/activity-table";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const user = await requirePageUser();
  const sql = getSql();
  const [counts, recent, events] = await Promise.all([
    statusCounts(sql, user),
    listActivities(sql, user, { limit: 8 }),
    sql<{ action: string; created_at: Date; actor_name: string | null; activity_id: string | null; title: string | null }[]>`
      select l.action, l.created_at, u.name as actor_name, l.activity_id, a.display_title as title
      from audit_logs l left join users u on u.id = l.actor_id left join activities a on a.id = l.activity_id
      where l.activity_id is not null and (${user.role === "admin"} or a.owner_id = ${user.id})
      order by l.created_at desc limit 10`,
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tiles = [
    { label: "All activities", value: total, href: "/activities" },
    { label: "Drafts", value: (counts.DRAFT ?? 0) + (counts.PROCESSING ?? 0), href: "/activities?status=DRAFT" },
    { label: "Review required", value: counts.REVIEW_REQUIRED ?? 0, href: "/activities?status=REVIEW_REQUIRED" },
    { label: "Ready for approval", value: counts.READY_FOR_APPROVAL ?? 0, href: "/activities?status=READY_FOR_APPROVAL" },
    { label: "Approved", value: counts.APPROVED ?? 0, href: "/activities?status=APPROVED" },
  ];
  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name}`}
        description="Activity documentation: collect the notice, attendance and photographs, review what was extracted, then approve the reports."
        actions={<Link href="/activities/new" className="btn btn-primary">Create activity</Link>}
      />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card p-4 hover:border-brand/40">
            <div className="text-xs text-muted">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Recent activities</h2>
          {recent.length ? (
            <ActivityTable items={recent} showOwner={user.role === "admin"} />
          ) : (
            <EmptyState title="No activities yet">
              Start with <Link className="text-brand underline" href="/activities/new">Create activity</Link>. You can enter details by hand or upload the notice and reports to extract them.
            </EmptyState>
          )}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Recent changes</h2>
          <div className="card divide-y divide-line">
            {events.length === 0 && <p className="p-4 text-sm text-muted">No changes recorded yet.</p>}
            {events.map((e, i) => (
              <div key={i} className="px-4 py-2.5 text-sm">
                <div>
                  <span className="font-medium">{AUDIT_LABELS[e.action] ?? e.action}</span>
                  {e.activity_id && (
                    <>
                      {" · "}
                      <Link href={`/activities/${e.activity_id}`} className="text-brand hover:underline">
                        {e.title ?? "Untitled activity"}
                      </Link>
                    </>
                  )}
                </div>
                <div className="text-xs text-muted">{e.actor_name ?? "System"} · {fmtDateTime(e.created_at)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <p className="mt-8 text-xs text-muted">Statuses: {["DRAFT", "PROCESSING", "REVIEW_REQUIRED", "READY_FOR_APPROVAL", "APPROVED", "ARCHIVED"].map((s) => <span key={s} className="mr-1"><StatusChip status={s} /></span>)}</p>
    </>
  );
}
