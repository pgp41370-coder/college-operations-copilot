"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AUDIT_LABELS } from "@/lib/audit-labels";
import { api, errorText } from "@/components/client-api";
import { fmtDateTime, Notice, StatusChip } from "@/components/ui";
import { AttendanceTab } from "./attendance-tab";
import { EvidenceTab } from "./evidence-tab";
import { ReportsTab } from "./reports-tab";
import { ReviewTab } from "./review-tab";
import type { Bundle } from "./types";

const TABS = [
  ["overview", "Overview"],
  ["evidence", "1 · Evidence"],
  ["review", "2 · Review fields"],
  ["attendance", "3 · Attendance"],
  ["reports", "4 · Reports"],
  ["approval", "5 · Approve"],
  ["history", "History"],
] as const;

export interface WorkspaceProps {
  bundle: Bundle;
  user: { id: string; role: string };
  ai: { mode: string; label: string };
}

export function Workspace({ bundle, initialTab, user, ai }: WorkspaceProps & { initialTab: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") ?? initialTab;
  const a = bundle.activity;
  const locked = a.status === "APPROVED" || a.status === "ARCHIVED";
  const setTab = (t: string) => router.replace(`/activities/${a.id}?tab=${t}`, { scroll: false });
  const props = { bundle, user, ai, locked, refresh: () => router.refresh() };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/activities" className="text-xs text-muted hover:underline">← Activities</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{a.display_title ?? <span className="italic text-muted">Untitled activity</span>}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <StatusChip status={a.status} />
            <span>Owner: {bundle.ownerName}</span>
            <span>·</span>
            <span>Template: {bundle.template.name} v{bundle.template.version}</span>
            {a.approved_at && (
              <>
                <span>·</span>
                <span>Approved by {bundle.approverName} on {fmtDateTime(a.approved_at)}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <nav className="no-print mb-5 flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {label}
            {k === "review" && bundle.state.blocking.some((b) => b.field) && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-900">{bundle.state.blocking.filter((b) => b.field).length}</span>
            )}
          </button>
        ))}
      </nav>
      {locked && (
        <div className="mb-4">
          <Notice tone={a.status === "APPROVED" ? "success" : "info"}>
            This activity is {a.status.toLowerCase()} and read-only.{user.role === "admin" ? " An administrator can reopen it from the Approve tab." : ""}
          </Notice>
        </div>
      )}
      {tab === "overview" && <Overview {...props} setTab={setTab} />}
      {tab === "evidence" && <EvidenceTab {...props} />}
      {tab === "review" && <ReviewTab {...props} />}
      {tab === "attendance" && <AttendanceTab {...props} />}
      {tab === "reports" && <ReportsTab {...props} />}
      {tab === "approval" && <ApprovalTab {...props} />}
      {tab === "history" && <HistoryTab bundle={bundle} />}
    </>
  );
}

type TabProps = WorkspaceProps & { locked: boolean; refresh: () => void };

function IssueList({ bundle, setTab }: { bundle: Bundle; setTab?: (t: string) => void }) {
  const { blocking, warnings } = bundle.state;
  const tabFor = (code: string) =>
    code.startsWith("report") ? "reports" : code.startsWith("reconciliation") || code.startsWith("attendance") ? "attendance" : code.startsWith("extraction") ? "evidence" : "review";
  return (
    <div className="space-y-2">
      {blocking.length === 0 && <Notice tone="success">No blocking issues. The activity can be approved.</Notice>}
      {blocking.map((b, i) => (
        <div key={`b${i}`} className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{b.message}</span>
          {setTab && <button className="shrink-0 text-xs underline" onClick={() => setTab(tabFor(b.code))}>Resolve</button>}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div key={`w${i}`} className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{w.message}</span>
          {setTab && <button className="shrink-0 text-xs underline" onClick={() => setTab(tabFor(w.code))}>View</button>}
        </div>
      ))}
    </div>
  );
}

function Overview({ bundle, setTab }: TabProps & { setTab: (t: string) => void }) {
  const fields = bundle.state.fields;
  const count = (s: string) => fields.filter((f) => f.status === s).length;
  const steps = [
    { tab: "evidence", title: "Upload evidence", done: bundle.sources.length > 0, detail: `${bundle.sources.length} document(s)` },
    { tab: "review", title: "Review extracted fields", done: !bundle.state.blocking.some((b) => b.field), detail: `${count("extracted")} extracted · ${count("user_entered")} entered · ${count("conflicting")} conflicts` },
    { tab: "attendance", title: "Check attendance", done: bundle.state.reconciliation.overall === "PASS" || bundle.state.ackValid, detail: `${bundle.attendance.length} rows · reconciliation ${bundle.state.reconciliation.overall.replace("_", " ").toLowerCase()}` },
    { tab: "reports", title: "Generate reports", done: !bundle.state.blocking.some((b) => b.code.startsWith("reports")), detail: bundle.reports.length ? `Generated ${fmtDateTime(bundle.state.latestReportsAt)}` : "Not generated" },
    { tab: "approval", title: "Faculty approval", done: bundle.activity.status === "APPROVED", detail: bundle.activity.status === "APPROVED" ? "Approved" : "Pending" },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="lg:col-span-2">
        <h2 className="mb-2 text-sm font-semibold">Workflow</h2>
        <ol className="card divide-y divide-line">
          {steps.map((s, i) => (
            <li key={s.tab}>
              <button onClick={() => setTab(s.tab)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"}`}>{s.done ? "✓" : i + 1}</span>
                <span>
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="block text-xs text-muted">{s.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="lg:col-span-3">
        <h2 className="mb-2 text-sm font-semibold">What needs attention</h2>
        <IssueList bundle={bundle} setTab={setTab} />
      </section>
    </div>
  );
}

function ApprovalTab({ bundle, user, locked, refresh }: TabProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const a = bundle.activity;
  const run = async (action: string, extra: Record<string, string> = {}) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/activities/${a.id}/workflow`, { body: { action, ...extra } });
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-3xl space-y-5">
      <IssueList bundle={bundle} />
      {!locked && (
        <div className="card space-y-3 p-4">
          <h2 className="text-sm font-semibold">Approve activity</h2>
          <p className="text-sm text-muted">
            Approving records you ({"the signed-in reviewer"}) as the approver with the current time, and locks the activity. The system never approves automatically. Physical signatures are added on the printed documents — no signature is generated.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy || bundle.state.blocking.length > 0} onClick={() => run("approve")}>Approve</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => confirm("Archive this activity? It becomes read-only.") && run("archive")}>Archive</button>
          </div>
          {bundle.state.blocking.length > 0 && <p className="text-xs text-red-700">Report cannot be approved until the blocking issues above are resolved.</p>}
        </div>
      )}
      {a.status === "APPROVED" && (
        <div className="card p-4 text-sm">
          <p>Approved by <strong>{bundle.approverName}</strong> on {fmtDateTime(a.approved_at)}.</p>
          <button className="btn btn-secondary mt-3" disabled={busy} onClick={() => confirm("Archive this approved activity?") && run("archive")}>Archive</button>
        </div>
      )}
      {locked && user.role === "admin" && (
        <div className="card space-y-2 p-4">
          <h2 className="text-sm font-semibold">Reopen (administrator)</h2>
          <input className="input" placeholder="Reason for reopening" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-danger" disabled={busy || reason.trim().length < 5} onClick={() => run("reopen", { reason })}>Reopen for editing</button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function HistoryTab({ bundle }: { bundle: Bundle }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>
        </thead>
        <tbody>
          {bundle.audit.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap text-muted">{fmtDateTime(e.created_at)}</td>
              <td className="whitespace-nowrap">{e.actor_name ?? "System"}</td>
              <td className="whitespace-nowrap font-medium">{AUDIT_LABELS[e.action] ?? e.action}</td>
              <td className="max-w-xl break-words font-mono text-xs text-muted">{JSON.stringify(e.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
