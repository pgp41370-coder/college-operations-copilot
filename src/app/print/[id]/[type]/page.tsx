import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { getActivity, latestReports } from "@/lib/server/activities";
import { requirePageUser } from "@/lib/server/auth";
import type { ActivityReportContent, AttendanceSummaryContent, DetailedReportContent } from "@/lib/reports/build";
import { ActivityReportPaper, AttendanceSummaryPaper, DetailedReportPaper } from "@/components/report-paper";
import { PrintButton } from "./print-button";

export const metadata = { title: "Print" };

export default async function PrintPage(props: { params: Promise<{ id: string; type: string }> }) {
  const user = await requirePageUser();
  const { id, type } = await props.params;
  const sql = getSql();
  const activity = await getActivity(sql, user, id).catch(() => null);
  if (!activity) notFound();
  const report = (await latestReports(sql, id)).find((r) => r.report_type === type);
  if (!report) notFound();
  return (
    <div className="min-h-screen bg-white py-6">
      <div className="no-print mx-auto mb-4 flex max-w-[800px] items-center justify-between gap-3 px-4 text-sm">
        <span className={activity.status === "APPROVED" ? "text-emerald-700" : "font-medium text-amber-800"}>
          {activity.status === "APPROVED" ? "Approved version" : "DRAFT — not yet approved by faculty"} · version {report.version}
        </span>
        <PrintButton />
      </div>
      {type === "activity_report" && <ActivityReportPaper c={report.content as ActivityReportContent} />}
      {type === "detailed_report" && <DetailedReportPaper c={report.content as DetailedReportContent} />}
      {type === "attendance_summary" && <AttendanceSummaryPaper c={report.content as AttendanceSummaryContent} />}
    </div>
  );
}
