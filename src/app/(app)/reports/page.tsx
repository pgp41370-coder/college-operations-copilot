import Link from "next/link";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { EmptyState, fmtDateTime, PageHeader, StatusChip } from "@/components/ui";

export const metadata = { title: "Reports" };

const LABEL: Record<string, string> = { activity_report: "Activity Report", detailed_report: "Detailed Report", attendance_summary: "Attendance Summary" };

export default async function ReportsPage() {
  const user = await requirePageUser();
  const rows = await getSql()<{ activity_id: string; title: string | null; status: string; report_type: string; version: number; generated_at: Date }[]>`
    select distinct on (r.activity_id, r.report_type) r.activity_id, a.display_title as title, a.status, r.report_type, r.version, r.generated_at
    from generated_reports r join activities a on a.id = r.activity_id
    where ${user.role === "admin"} or a.owner_id = ${user.id}
    order by r.activity_id, r.report_type, r.version desc`;
  rows.sort((a, b) => b.generated_at.getTime() - a.generated_at.getTime());
  return (
    <>
      <PageHeader title="Reports" description="Latest generated version of each report. Reports are generated only from reviewed fields; exports of unapproved activities are marked DRAFT." />
      {rows.length === 0 ? (
        <EmptyState title="No reports generated yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Activity</th><th>Report</th><th>Version</th><th>Status</th><th>Generated</th><th>Download</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.activity_id}-${r.report_type}`}>
                  <td><Link className="text-brand hover:underline" href={`/activities/${r.activity_id}?tab=reports`}>{r.title ?? "Untitled activity"}</Link></td>
                  <td>{LABEL[r.report_type]}</td>
                  <td className="tabular-nums">v{r.version}</td>
                  <td><StatusChip status={r.status} /></td>
                  <td className="text-muted">{fmtDateTime(r.generated_at)}</td>
                  <td className="space-x-2 whitespace-nowrap text-xs">
                    <a className="text-brand underline" href={`/api/activities/${r.activity_id}/export?type=${r.report_type}&format=pdf`}>PDF</a>
                    <a className="text-brand underline" href={`/api/activities/${r.activity_id}/export?type=${r.report_type}&format=docx`}>DOCX</a>
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
