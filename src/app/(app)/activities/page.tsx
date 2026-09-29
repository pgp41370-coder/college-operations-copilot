import Link from "next/link";
import { getSql } from "@/lib/db";
import { listActivities, STATUSES } from "@/lib/server/activities";
import { requirePageUser } from "@/lib/server/auth";
import { EmptyState, PageHeader, STATUS_LABELS } from "@/components/ui";
import { ActivityTable } from "./activity-table";

export const metadata = { title: "Activities" };

export default async function ActivitiesPage(props: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePageUser();
  const { status } = await props.searchParams;
  const items = await listActivities(getSql(), user, { status });
  return (
    <>
      <PageHeader
        title="Activities"
        description={user.role === "admin" ? "All activities in the institution (administrator view)." : "Activities you created."}
        actions={<Link href="/activities/new" className="btn btn-primary">Create activity</Link>}
      />
      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        <Link href="/activities" className={`rounded-full px-3 py-1 ${!status ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>All</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/activities?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>
      {items.length ? <ActivityTable items={items} showOwner={user.role === "admin"} /> : <EmptyState title="No activities match this filter." />}
    </>
  );
}
