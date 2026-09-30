import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { EmptyState, fmtDateTime, fmtRelative, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Reports" };

const LABEL: Record<string, string> = { activity_report: "Activity Report", detailed_report: "Detailed Report", attendance_summary: "Attendance Summary" };

export default async function ReportsPage() {
  const user = await requirePageUser();
  const rows = await getSql()<{ activity_id: string; title: string | null; status: string; report_type: string; version: number; generated_at: Date; generated_by: string | null }[]>`
    select distinct on (r.activity_id, r.report_type) r.activity_id, a.display_title as title, a.status, r.report_type, r.version, r.generated_at, u.name as generated_by
    from generated_reports r join activities a on a.id = r.activity_id left join users u on u.id = r.generated_by
    where ${user.role === "admin"} or a.owner_id = ${user.id}
    order by r.activity_id, r.report_type, r.version desc`;
  rows.sort((a, b) => b.generated_at.getTime() - a.generated_at.getTime());
  return (
    <>
      <PageHeader title="Reports" description="Latest generated version of each report. Reports are generated only from reviewed fields; exports of unapproved activities are marked DRAFT." />
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title="No reports generated yet">Generate reports from an activity&apos;s Reports tab once its fields are reviewed.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Report</th>
                <th>Version</th>
                <th>Activity status</th>
                <th>Generated</th>
                <th className="text-right">Download</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.activity_id}-${r.report_type}`}>
                  <td className="max-w-[280px]">
                    <Link className="block truncate font-medium hover:text-brand" href={`/activities/${r.activity_id}?tab=reports`}>
                      {r.title ?? "Untitled activity"}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-muted" aria-hidden />{LABEL[r.report_type] ?? r.report_type}</span>
                  </td>
                  <td className="t-num">v{r.version}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="t-meta whitespace-nowrap" title={fmtDateTime(r.generated_at)}>{fmtRelative(r.generated_at)}{r.generated_by ? ` · ${r.generated_by}` : ""}</td>
                  <td className="whitespace-nowrap text-right">
                    <a className="btn btn-ghost btn-sm" href={`/api/activities/${r.activity_id}/export?type=${r.report_type}&format=pdf`} aria-label={`${LABEL[r.report_type]} PDF`}>
                      <Download className="h-3.5 w-3.5" aria-hidden /> PDF
                    </a>
                    <a className="btn btn-ghost btn-sm" href={`/api/activities/${r.activity_id}/export?type=${r.report_type}&format=docx`} aria-label={`${LABEL[r.report_type]} DOCX`}>
                      <Download className="h-3.5 w-3.5" aria-hidden /> DOCX
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
