import Link from "next/link";
import { CalendarDays, FileStack } from "lucide-react";
import type { ActivityListItem } from "@/lib/server/activities";
import { formatDate } from "@/lib/normalize";
import { fmtDateTime, fmtRelative, StatusBadge } from "@/components/ui";

export function ActivityTable({ items, showOwner }: { items: ActivityListItem[]; showOwner: boolean }) {
  return (
    <>
      <div className="card hidden overflow-x-auto md:block">
        <table className="table">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Date of activity</th>
              {showOwner && <th>Owner</th>}
              <th className="text-right">Documents</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td className="max-w-md">
                  <Link href={`/activities/${a.id}`} className="font-medium hover:text-brand">
                    {a.display_title ?? <span className="italic text-muted">Untitled activity</span>}
                  </Link>
                </td>
                <td className="t-num whitespace-nowrap">{a.activity_date ? formatDate(a.activity_date, "DD/MM/YYYY") : <span className="text-subtle">—</span>}</td>
                {showOwner && <td className="whitespace-nowrap text-fg-2">{a.owner_name}</td>}
                <td className="t-num text-right">{a.source_count}</td>
                <td><StatusBadge status={a.status} /></td>
                <td className="t-meta whitespace-nowrap" title={fmtDateTime(a.updated_at)}>{fmtRelative(a.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {items.map((a) => (
          <li key={a.id}>
            <Link href={`/activities/${a.id}`} className="card card-hover block px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{a.display_title ?? <span className="italic text-muted">Untitled activity</span>}</span>
                <StatusBadge status={a.status} />
              </div>
              <div className="t-meta mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" aria-hidden />{a.activity_date ? formatDate(a.activity_date, "DD/MM/YYYY") : "No date"}</span>
                <span className="flex items-center gap-1"><FileStack className="h-3 w-3" aria-hidden />{a.source_count} documents</span>
                {showOwner && <span>{a.owner_name}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
