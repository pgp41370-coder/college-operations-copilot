"use client";
import { useState } from "react";
import { Archive, Braces, Download, Eye, FileArchive, FileText, Printer, RefreshCw, Sparkles, Users, type LucideIcon } from "lucide-react";
import type { ActivityReportContent, AttendanceSummaryContent, DetailedReportContent } from "@/lib/reports/build";
import { api, errorText } from "@/components/client-api";
import { ActivityReportPaper, AttendanceSummaryPaper, DetailedReportPaper } from "@/components/report-paper";
import { Badge, Button, Card, CardHeader, cx, EmptyState, fmtDateTime, Notice, Segmented } from "@/components/ui";
import type { TabProps } from "./workspace";

type View = "activity_report" | "detailed_report" | "attendance_summary";
const VIEWS: { value: View; label: string }[] = [
  { value: "activity_report", label: "Activity Report" },
  { value: "detailed_report", label: "Detailed Report" },
  { value: "attendance_summary", label: "Attendance Summary" },
];

export function ReportsTab({ bundle, locked, refresh }: TabProps) {
  const [view, setView] = useState<View>("activity_report");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "info" | "success"; text: string } | null>(null);
  const id = bundle.activity.id;
  const report = bundle.reports.find((r) => r.report_type === view);
  const stale = bundle.state.blocking.some((b) => b.code === "reports_stale");
  const approved = bundle.activity.status === "APPROVED";
  const labelOf = (k: string) => bundle.state.def.fields.find((f) => f.key === k)?.label ?? k;
  const has = bundle.reports.length > 0;

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
  const versionOf = (t: string) => bundle.reports.find((r) => r.report_type === t)?.version;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="t-body text-fg-2">
            {has ? <>Last generated {fmtDateTime(bundle.state.latestReportsAt)} · deterministic template (no AI model)</> : "Reports have not been generated yet."}
          </p>
          <p className="t-meta mt-0.5">Reports are filled only from reviewed fields and attendance rows. Missing values print as “Not provided”.</p>
        </div>
        {!locked && (
          <Button variant="primary" icon={has ? RefreshCw : Sparkles} loading={busy === "generate"} disabled={!!busy} onClick={generate}>
            {busy === "generate" ? "Generating…" : has ? "Regenerate reports" : "Generate reports"}
          </Button>
        )}
      </div>
      {stale && !locked && <Notice tone="warn">Details changed after these reports were generated. Regenerate before approval.</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {!has ? (
        <EmptyState icon={FileText} title="No reports yet">
          Generating creates the Activity Report, Detailed Report and Attendance Summary from the current fields. You can regenerate at any time before approval.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReportCard icon={FileText} title="Activity Report" version={versionOf("activity_report")} stale={stale} approved={approved} onPreview={() => setView("activity_report")} active={view === "activity_report"}>
              <DlLink href={dl("activity_report", "docx")} label="Activity Report (.docx)" short="DOCX" />
              <DlLink href={dl("activity_report", "pdf")} label="Activity Report (.pdf)" short="PDF" />
            </ReportCard>
            <ReportCard icon={FileText} title="Detailed Report" version={versionOf("detailed_report")} stale={stale} approved={approved} onPreview={() => setView("detailed_report")} active={view === "detailed_report"}>
              <DlLink href={dl("detailed_report", "docx")} label="Detailed Report (.docx)" short="DOCX" />
              <DlLink href={dl("detailed_report", "pdf")} label="Detailed Report (.pdf)" short="PDF" />
            </ReportCard>
            <ReportCard icon={Users} title="Attendance Summary" version={versionOf("attendance_summary")} stale={stale} approved={approved} onPreview={() => setView("attendance_summary")} active={view === "attendance_summary"}>
              <DlLink href={dl("attendance_summary", "docx")} label="Attendance Summary (.docx)" short="DOCX" />
              <DlLink href={dl("attendance_summary", "pdf")} label="Attendance Summary (.pdf)" short="PDF" />
              <DlLink href={dl("attendance_csv", "csv")} label="Attendance (.csv)" short="CSV" />
            </ReportCard>
            <ReportCard icon={FileArchive} title="Activity Packet" stale={stale} approved={approved} note="Built in your browser from the reports and uploaded documents.">
              <button className="btn btn-secondary btn-sm" aria-label="Compiled activity packet (.pdf)" disabled={!!busy} onClick={() => client("packet")}>
                <Download className="h-3.5 w-3.5" aria-hidden /> {busy === "packet" ? "Building…" : "Packet PDF"}
              </button>
              <button className="btn btn-secondary btn-sm" aria-label="Evidence package (.zip)" disabled={!!busy} onClick={() => client("zip")}>
                <Archive className="h-3.5 w-3.5" aria-hidden /> {busy === "zip" ? "Building…" : "Evidence ZIP"}
              </button>
            </ReportCard>
          </div>
          <p className="t-meta">Exports of activities that are not approved carry a “DRAFT — not yet approved” footer. No signatures are generated: signature spaces are left blank for physical signing.</p>

          <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Segmented<View> ariaLabel="Report to preview" value={view} onChange={setView} options={VIEWS} />
                <a className="btn btn-ghost btn-sm" href={`/print/${id}/${view}`} target="_blank">
                  <Printer className="h-3.5 w-3.5" aria-hidden /> Print view
                </a>
              </div>
              {report && <ProvenanceNote content={report.content as never} labelOf={labelOf} />}
              <div className="scroll-thin overflow-x-auto rounded-xl border border-line bg-surface-3 p-3 sm:p-6">
                {report ? (
                  <>
                    {view === "activity_report" && <ActivityReportPaper c={report.content as ActivityReportContent} />}
                    {view === "detailed_report" && <DetailedReportPaper c={report.content as DetailedReportContent} />}
                    {view === "attendance_summary" && <AttendanceSummaryPaper c={report.content as AttendanceSummaryContent} />}
                  </>
                ) : (
                  <p className="t-meta p-6 text-center">This report has not been generated.</p>
                )}
              </div>
            </div>
            <aside className="space-y-4">
              <Card>
                <CardHeader title="Document details" />
                {report ? (
                  <dl className="space-y-2.5 px-4 py-3 text-[13px]">
                    <Meta label="Report">{VIEWS.find((v) => v.value === view)?.label}</Meta>
                    <Meta label="Version">v{report.version}</Meta>
                    <Meta label="Generated by">{report.generated_by_name}</Meta>
                    <Meta label="Generated">{fmtDateTime(report.generated_at)}</Meta>
                    <Meta label="Template">{bundle.template.name} v{bundle.template.version}</Meta>
                    <Meta label="Method">Deterministic template</Meta>
                    <Meta label="State">{approved ? <Badge tone="success">Approved</Badge> : stale ? <Badge tone="warning">Out of date</Badge> : <Badge tone="warning">Draft</Badge>}</Meta>
                  </dl>
                ) : (
                  <p className="t-meta px-4 py-3">No details.</p>
                )}
              </Card>
              <Card>
                <CardHeader title="Other exports" />
                <div className="flex flex-col gap-1.5 p-3">
                  <a className="btn btn-ghost btn-sm justify-start" href={dl("manifest", "json")} aria-label="Provenance manifest (.json)">
                    <Braces className="h-3.5 w-3.5" aria-hidden /> Provenance manifest (.json)
                  </a>
                </div>
              </Card>
              <p className="t-meta">To change wording, edit the fields on the Review tab and regenerate.</p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function ReportCard({ icon: Icon, title, version, stale, approved, onPreview, active, note, children }: { icon: LucideIcon; title: string; version?: number; stale: boolean; approved: boolean; onPreview?: () => void; active?: boolean; note?: string; children: React.ReactNode }) {
  return (
    <div className={cx("card flex flex-col p-4 transition-shadow", active && "ring-2 ring-brand-line")}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand-line">
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
        {approved ? <Badge tone="success">Approved</Badge> : stale ? <Badge tone="warning">Out of date</Badge> : <Badge tone="warning">Draft</Badge>}
      </div>
      <h3 className="t-card mt-3">{title}</h3>
      <p className="t-meta mt-0.5">{version ? `Version ${version}` : note}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {children}
        {onPreview && (
          <button className="btn btn-ghost btn-sm" onClick={onPreview} aria-pressed={active}>
            <Eye className="h-3.5 w-3.5" aria-hidden /> Preview
          </button>
        )}
      </div>
    </div>
  );
}

function DlLink({ href, label, short }: { href: string; label: string; short: string }) {
  return (
    <a className="btn btn-secondary btn-sm" href={href} aria-label={label} title={label}>
      <Download className="h-3.5 w-3.5" aria-hidden /> {short}
    </a>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
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
  return (
    <Notice tone="warn">
      {notes.map((n, i) => (
        <div key={i}>{n}</div>
      ))}
    </Notice>
  );
}
