import Link from "next/link";
import type { ActivityListItem } from "@/lib/server/activities";
import { formatDate } from "@/lib/normalize";
import { fmtDateTime, StatusChip } from "@/components/ui";

export function ActivityTable({ items, showOwner }: { items: ActivityListItem[]; showOwner: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Activity</th>
            <th>Date of activity</th>
            {showOwner && <th>Owner</th>}
            <th>Documents</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50">
              <td className="max-w-md">
                <Link href={`/activities/${a.id}`} className="font-medium text-brand hover:underline">
                  {a.display_title ?? <span className="italic text-muted">Untitled activity</span>}
                </Link>
              </td>
              <td className="whitespace-nowrap">{a.activity_date ? formatDate(a.activity_date, "DD/MM/YYYY") : <span className="text-muted">—</span>}</td>
              {showOwner && <td>{a.owner_name}</td>}
              <td className="tabular-nums">{a.source_count}</td>
              <td><StatusChip status={a.status} /></td>
              <td className="whitespace-nowrap text-muted">{fmtDateTime(a.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
