"use client";
import { useState } from "react";
import type { ActivityReportContent, AttendanceSummaryContent, DetailedReportContent } from "@/lib/reports/build";
import { api, errorText } from "@/components/client-api";
import { ActivityReportPaper, AttendanceSummaryPaper, DetailedReportPaper } from "@/components/report-paper";
import { fmtDateTime, Notice } from "@/components/ui";
import type { WorkspaceProps } from "./workspace";

type Props = WorkspaceProps & { locked: boolean; refresh: () => void };

const TYPES = [
  ["activity_report", "Activity Report"],
  ["detailed_report", "Detailed Report"],
  ["attendance_summary", "Attendance Summary"],
] as const;

export function ReportsTab({ bundle, locked, refresh }: Props) {
  const [view, setView] = useState<(typeof TYPES)[number][0]>("activity_report");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "info" | "success"; text: string } | null>(null);
  const id = bundle.activity.id;
  const report = bundle.reports.find((r) => r.report_type === view);
  const stale = bundle.state.blocking.some((b) => b.code === "reports_stale");
  const labelOf = (k: string) => bundle.state.def.fields.find((f) => f.key === k)?.label ?? k;

  const generate = async () => {
    setBusy("generate");
    setMsg(null);
    try {
      await api(`/api/activities/${id}/reports`, { body: {} });
      refresh();
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const client = async (kind: "packet" | "zip") => {
    setBusy(kind);
    try {
      const { buildPacketPdf, buildEvidenceZip, saveBlob } = await import("@/lib/exports/packet");
      const slug = (bundle.activity.display_title ?? "activity").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 50);
      if (kind === "packet") {
        const { bytes, skipped } = await buildPacketPdf(id, bundle.state.def, bundle.sources, (m) => setMsg({ tone: "info", text: m }));
        saveBlob(bytes, `${slug}-activity-packet.pdf`);
        setMsg(skipped.length ? { tone: "error", text: `Packet created, but some files could not be included: ${skipped.join("; ")}` } : { tone: "success", text: "Activity packet downloaded." });
      } else {
        saveBlob(await buildEvidenceZip(id, bundle.sources, (m) => setMsg({ tone: "info", text: m })), `${slug}-evidence-package.zip`);
        setMsg({ tone: "success", text: "Evidence package downloaded." });
      }
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const dl = (type: string, format: string) => `/api/activities/${id}/export?type=${type}&format=${format}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">
          {bundle.reports.length ? <>Last generated {fmtDateTime(bundle.state.latestReportsAt)} · deterministic template (no AI model)</> : "Reports have not been generated yet."}
        </div>
        {!locked && (
          <button className="btn btn-primary" disabled={!!busy} onClick={generate}>
            {busy === "generate" ? "Generating…" : bundle.reports.length ? "Regenerate reports" : "Generate reports"}
          </button>
        )}
      </div>
      {stale && !locked && <Notice tone="warn">Details changed after these reports were generated. Regenerate before approval.</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {bundle.reports.length > 0 && (
        <>
          <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="mr-1 font-medium">Download:</span>
            <a className="btn btn-secondary btn-sm" href={dl("activity_report", "docx")}>Activity Report (.docx)</a>
            <a className="btn btn-secondary btn-sm" href={dl("activity_report", "pdf")}>Activity Report (.pdf)</a>
            <a className="btn btn-secondary btn-sm" href={dl("detailed_report", "docx")}>Detailed Report (.docx)</a>
            <a className="btn btn-secondary btn-sm" href={dl("detailed_report", "pdf")}>Detailed Report (.pdf)</a>
            <a className="btn btn-secondary btn-sm" href={dl("attendance_summary", "pdf")}>Attendance Summary (.pdf)</a>
            <a className="btn btn-secondary btn-sm" href={dl("attendance_csv", "csv")}>Attendance (.csv)</a>
            <a className="btn btn-secondary btn-sm" href={dl("manifest", "json")}>Provenance manifest (.json)</a>
            <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => client("packet")}>{busy === "packet" ? "Building…" : "Compiled activity packet (.pdf)"}</button>
            <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => client("zip")}>{busy === "zip" ? "Building…" : "Evidence package (.zip)"}</button>
            <a className="btn btn-secondary btn-sm" href={`/print/${id}/${view}`} target="_blank">Print view</a>
          </div>
          <p className="text-xs text-muted">
            Exports of activities that are not approved carry a “DRAFT — not yet approved” footer. No signatures are generated: signature spaces are left blank for physical signing.
          </p>
          <div className="flex gap-1 border-b border-line">
            {TYPES.map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${view === k ? "border-brand text-brand" : "border-transparent text-muted"}`}>{l}</button>
            ))}
          </div>
          {report && (
            <div className="space-y-3">
              <ProvenanceNote content={report.content as never} labelOf={labelOf} />
              <div className="rounded-lg bg-slate-200 p-4">
                {view === "activity_report" && <ActivityReportPaper c={report.content as ActivityReportContent} />}
                {view === "detailed_report" && <DetailedReportPaper c={report.content as DetailedReportContent} />}
                {view === "attendance_summary" && <AttendanceSummaryPaper c={report.content as AttendanceSummaryContent} />}
              </div>
              <p className="text-xs text-muted">Version {report.version} · generated by {report.generated_by_name} · {fmtDateTime(report.generated_at)} · To change wording, edit the fields on the Review tab and regenerate.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProvenanceNote({ content, labelOf }: { content: ActivityReportContent | DetailedReportContent | AttendanceSummaryContent; labelOf: (k: string) => string }) {
  const notes: string[] = [];
  if (content.type === "activity_report" && content.missing.length) {
    notes.push(`Not provided: ${content.missing.map(labelOf).join(", ")}.`);
  }
  if (content.type === "detailed_report") {
    if (content.descriptionOrigin.kind === "draft") notes.push(`Event description was assembled from these fields only: ${content.descriptionOrigin.fields.map(labelOf).join(", ")}. Review the wording.`);
    if (content.impactOrigin.kind === "draft") notes.push(`Impact Analysis reuses the text of: ${content.impactOrigin.fields.map(labelOf).join(", ")}.`);
    if (content.missing.length) notes.push(`Not provided: ${content.missing.map(labelOf).join(", ")}.`);
  }
  if (!notes.length) return null;
  return <Notice tone="warn">{notes.map((n, i) => <div key={i}>{n}</div>)}</Notice>;
}
