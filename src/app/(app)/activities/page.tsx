import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { getSql } from "@/lib/db";
import { listActivities, statusCounts, STATUSES } from "@/lib/server/activities";
import { requirePageUser } from "@/lib/server/auth";
import { ButtonLink, cx, EmptyState, PageHeader, STATUS_LABELS } from "@/components/ui";
import { ActivityTable } from "./activity-table";

export const metadata = { title: "Activities" };

export default async function ActivitiesPage(props: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requirePageUser();
  const { status, q } = await props.searchParams;
  const sql = getSql();
  const [all, counts] = await Promise.all([listActivities(sql, user, { status }), statusCounts(sql, user)]);
  const needle = q?.trim().toLowerCase() ?? "";
  const items = needle ? all.filter((a) => (a.display_title ?? "").toLowerCase().includes(needle) || a.owner_name.toLowerCase().includes(needle)) : all;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const href = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    const qs = p.toString();
    return `/activities${qs ? `?${qs}` : ""}`;
  };
  return (
    <>
      <PageHeader
        title="Activities"
        description={user.role === "admin" ? "All activities in the institution (administrator view)." : "Activities you created."}
        actions={<ButtonLink href="/activities/new" variant="primary" icon={Plus}>Create activity</ButtonLink>}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="scroll-thin flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5">
          {[undefined, ...STATUSES].map((s) => {
            const active = (status ?? undefined) === s || (!status && !s);
            const n = s ? (counts[s] ?? 0) : total;
            return (
              <Link key={s ?? "all"} href={href(s)} aria-current={active ? "page" : undefined} className={cx("focus-ring flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] transition-colors", active ? "bg-surface font-medium text-foreground shadow-xs ring-1 ring-line" : "text-muted hover:text-foreground")}>
                {s ? STATUS_LABELS[s] : "All"}
                <span className="t-num text-[11px] text-muted">{n}</span>
              </Link>
            );
          })}
        </nav>
        <form action="/activities" className="relative w-full sm:w-64">
          {status && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Filter by title or owner" aria-label="Filter activities" className="input pl-8" />
        </form>
      </div>
      {items.length ? (
        <ActivityTable items={items} showOwner={user.role === "admin"} />
      ) : total === 0 ? (
        <EmptyState title="No activities yet" action={<ButtonLink href="/activities/new" variant="primary" icon={Plus}>Create activity</ButtonLink>}>
          An activity collects the notice, attendance sheets and photographs for one event, then produces reviewed reports.
        </EmptyState>
      ) : (
        <EmptyState icon={Search} title="No activities match this filter." action={<ButtonLink href="/activities">Clear filters</ButtonLink>} />
      )}
    </>
  );
}
