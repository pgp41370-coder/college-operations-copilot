"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Archive,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  FileStack,
  FileText,
  History,
  Info,
  LayoutDashboard,
  LockKeyhole,
  RotateCcw,
  ScanText,
  ShieldCheck,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AUDIT_LABELS } from "@/lib/audit-labels";
import { formatValue } from "@/lib/normalize";
import { trustState, TRUST_LABEL, TRUST_HELP, type TrustState } from "@/lib/trust";
import { api, errorText } from "@/components/client-api";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
  fmtDateTime,
  fmtRelative,
  Modal,
  Notice,
  PrincipleStrip,
  SourceBadge,
  StatusBadge,
  Stepper,
  Tabs,
  Timeline,
  TrustBadge,
  type StepState,
  type Tone,
} from "@/components/ui";
import { AttendanceTab } from "./attendance-tab";
import { EvidenceTab } from "./evidence-tab";
import { ReportsTab } from "./reports-tab";
import { ReviewTab } from "./review-tab";
import { FeedbackCard, type MyFeedback } from "./feedback-card";
import type { Bundle } from "./types";

export interface WorkspaceProps {
  bundle: Bundle;
  user: { id: string; role: string };
  ai: { mode: string; label: string };
}
export type TabProps = WorkspaceProps & { locked: boolean; refresh: () => void };

const ALIASES: Record<string, string> = { history: "audit", approve: "approval" };

/** Workflow position derived only from stored state (no guessing). */
function workflowSteps(b: Bundle): { label: string; state: StepState; hint: string; tab: string }[] {
  const { state, sources, activity } = b;
  const docs = sources.filter((s) => s.kind !== "photo");
  const fieldIssues = state.blocking.filter((x) => x.field);
  const conflicts = fieldIssues.filter((x) => x.code === "conflict").length;
  const running = docs.some((s) => s.extraction_status === "processing" || s.extraction_status === "pending");
  const failed = docs.filter((s) => s.extraction_status === "failed").length;
  const extracted = docs.filter((s) => s.extraction_status === "done").length;
  const recon = state.reconciliation.overall;
  const reportsReady = b.reports.length > 0 && !state.blocking.some((x) => x.code === "reports_stale" || x.code === "reports_missing");
  const approved = activity.status === "APPROVED" || activity.status === "ARCHIVED";
  const filled = state.fields.filter((f) => f.value).length;

  const steps: { label: string; state: StepState; hint: string; tab: string }[] = [
    { label: "Details", state: "done", hint: `${filled} of ${state.def.fields.length} fields`, tab: "overview" },
    { label: "Evidence", state: sources.length ? "done" : "todo", hint: `${sources.length} document${sources.length === 1 ? "" : "s"}`, tab: "evidence" },
    {
      label: "Extraction",
      state: !docs.length ? "todo" : running ? "current" : failed ? "blocked" : extracted ? "done" : "todo",
      hint: !docs.length ? "No documents to read" : running ? "Running" : failed ? `${failed} failed` : `${extracted} read`,
      tab: "evidence",
    },
    {
      label: "Validation",
      state: recon === "PASS" || state.ackValid ? "done" : recon === "FAIL" ? "blocked" : "todo",
      hint: state.ackValid ? "Mismatch acknowledged" : recon === "PASS" ? "Counts reconcile" : recon === "FAIL" ? "Counts differ" : recon === "UNVERIFIED" ? "Rows unverified" : "Not enough data",
      tab: "attendance",
    },
    {
      label: "Review",
      state: fieldIssues.length === 0 ? "done" : conflicts ? "blocked" : "todo",
      hint: fieldIssues.length === 0 ? "No field issues" : conflicts ? `${conflicts} conflict${conflicts === 1 ? "" : "s"}` : `${fieldIssues.length} to review`,
      tab: "review",
    },
    { label: "Generate", state: reportsReady ? "done" : b.reports.length ? "blocked" : "todo", hint: reportsReady ? `v${Math.max(...b.reports.map((r) => r.version))}` : b.reports.length ? "Out of date" : "Not generated", tab: "reports" },
    { label: "Approve", state: approved ? "done" : "todo", hint: approved ? `by ${b.approverName ?? "reviewer"}` : state.blocking.length ? `${state.blocking.length} blocking` : "Ready", tab: "approval" },
  ];
  // The first unfinished step is the current one (unless it is blocked).
  const first = steps.find((s) => s.state === "todo");
  if (first && !steps.some((s) => s.state === "current")) first.state = "current";
  return steps;
}

export function Workspace({ bundle, initialTab, user, ai, feedback }: WorkspaceProps & { initialTab: string; feedback: MyFeedback | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab") ?? initialTab;
  const tab = ALIASES[raw] ?? raw;
  const a = bundle.activity;
  const locked = a.status === "APPROVED" || a.status === "ARCHIVED";
  const setTab = (t: string) => router.replace(`/activities/${a.id}?tab=${t}`, { scroll: false });
  const props: TabProps = { bundle, user, ai, locked, refresh: () => router.refresh() };
  const steps = workflowSteps(bundle);
  const fieldIssues = bundle.state.blocking.filter((b) => b.field);
  const conflicts = fieldIssues.filter((b) => b.code === "conflict").length;
  const attRows = bundle.attendance.filter((r) => !r.verified).length;
  const date = bundle.state.fields.find((f) => f.field_key === "activity_date")?.value;

  const TABS = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "evidence", label: "Evidence", icon: FileStack, count: bundle.sources.length, countTone: "neutral" as const },
    { key: "review", label: "Review", icon: ScanText, count: fieldIssues.length, countTone: conflicts ? ("danger" as const) : ("warning" as const) },
    { key: "attendance", label: "Attendance", icon: Users, count: attRows, countTone: "warning" as const },
    { key: "reports", label: "Reports", icon: FileText },
    { key: "approval", label: "Approve", icon: UserCheck },
    { key: "audit", label: "Audit", icon: History },
  ];

  return (
    <>
      <div className="mb-5">
        <Link href="/activities" className="t-meta inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Activities
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="t-page min-w-0 break-words">{a.display_title ?? <span className="italic text-muted">Untitled activity</span>}</h1>
              <StatusBadge status={a.status} />
            </div>
            <div className="t-meta mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {date && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  {formatValue("date", date, bundle.state.def.dateFormat)}
                </span>
              )}
              <span>Owner: {bundle.ownerName}</span>
              <span>Template: {bundle.template.name} v{bundle.template.version}</span>
              <span title={fmtDateTime(a.updated_at)}>Updated {fmtRelative(a.updated_at)}</span>
              {a.approved_at && (
                <span className="flex items-center gap-1 text-success">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Approved by {bundle.approverName} on {fmtDateTime(a.approved_at)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Card className="no-print mb-5 px-4 py-4 md:px-6">
        <Stepper steps={steps.map((s) => ({ ...s, href: `/activities/${a.id}?tab=${s.tab}` }))} />
      </Card>

      <div className="no-print mb-5">
        <Tabs items={TABS} active={tab} onChange={setTab} ariaLabel="Activity sections" />
      </div>

      {locked && (
        <div className="mb-4">
          <Notice tone={a.status === "APPROVED" ? "success" : "info"} title={a.status === "APPROVED" ? "Approved — read-only" : "Archived — read-only"}>
            This activity is {a.status.toLowerCase()} and read-only.{user.role === "admin" ? " An administrator can reopen it from the Approve tab." : ""}
          </Notice>
        </div>
      )}
      <div key={tab} className="anim-fade">
        {tab === "overview" && <Overview {...props} setTab={setTab} />}
        {tab === "evidence" && <EvidenceTab {...props} />}
        {tab === "review" && <ReviewTab {...props} />}
        {tab === "attendance" && <AttendanceTab {...props} />}
        {tab === "reports" && <ReportsTab {...props} />}
        {tab === "approval" && <ApprovalTab {...props} setTab={setTab} feedback={feedback} />}
        {tab === "audit" && <AuditTab bundle={bundle} />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ issues */
const TAB_FOR = (code: string) =>
  code.startsWith("report") ? "reports" : code.startsWith("reconciliation") || code.startsWith("attendance") ? "attendance" : code.startsWith("extraction") ? "evidence" : "review";

export function IssueList({ bundle, setTab }: { bundle: Bundle; setTab?: (t: string) => void }) {
  const { blocking, warnings } = bundle.state;
  const row = (message: string, code: string, tone: "danger" | "warning", key: string) => (
    <li key={key} className={cx("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]", tone === "danger" ? "border-danger-line bg-danger-soft" : "border-warning-line bg-warning-soft")}>
      {tone === "danger" ? <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="t-caption mr-1.5">{tone === "danger" ? "Blocking" : "Warning"}</span>
        {message}
      </span>
      {setTab && (
        <button className="btn btn-secondary btn-sm shrink-0" onClick={() => setTab(TAB_FOR(code))}>
          {tone === "danger" ? "Resolve" : "View"}
        </button>
      )}
    </li>
  );
  return (
    <ul className="space-y-2">
      {blocking.length === 0 && (
        <li>
          <Notice tone="success">{bundle.activity.status === "APPROVED" || bundle.activity.status === "ARCHIVED" ? "No blocking issues." : "No blocking issues. The activity can be approved."}</Notice>
        </li>
      )}
      {blocking.map((b, i) => row(b.message, b.code, "danger", `b${i}`))}
      {warnings.map((w, i) => row(w.message, w.code, "warning", `w${i}`))}
    </ul>
  );
}

/* ---------------------------------------------------------------- overview */
const TRUST_ORDER: TrustState[] = ["verified", "source_backed", "needs_review", "conflict", "missing"];
const BAR: Record<TrustState, string> = { verified: "bg-success", source_backed: "bg-brand", needs_review: "bg-warning", conflict: "bg-danger", missing: "bg-line-strong" };

function Overview({ bundle, setTab }: TabProps & { setTab: (t: string) => void }) {
  const def = bundle.state.def;
  const rows = def.fields.map((f) => ({ f, row: bundle.state.fields.find((x) => x.field_key === f.key) }));
  const states = rows.map(({ row }) => trustState(row));
  const count = (s: TrustState) => states.filter((x) => x === s).length;
  const total = def.fields.length;
  const r = bundle.state.reconciliation;
  const docs = bundle.sources;
  const pages = docs.reduce((n, s) => n + (s.pages_extracted ?? 0), 0);
  const ocrConf = docs.filter((s) => s.mean_confidence != null && (s.methods ?? []).includes("ocr"));
  const reqMissing = rows.filter(({ f }, i) => f.required && (states[i] === "missing" || states[i] === "conflict")).length;
  // Template-driven: the "details" group, required fields first.
  const shown = rows.filter(({ f }) => f.group === "details").sort((x, y) => Number(y.f.required) - Number(x.f.required)).slice(0, 8);

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <CardHeader icon={ShieldCheck} title="Trust summary" description={`${total} template fields · classified from stored provenance, confidence and review actions`} />
          <div className="px-4 py-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={TRUST_ORDER.map((s) => `${TRUST_LABEL[s]} ${count(s)}`).join(", ")}>
              {TRUST_ORDER.map((s) => count(s) > 0 && <div key={s} className={cx("h-full", BAR[s])} style={{ width: `${(count(s) / total) * 100}%` }} />)}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TRUST_ORDER.map((s) => (
                <li key={s} className="rounded-lg border border-line bg-surface-2 px-3 py-2.5" title={TRUST_HELP[s]}>
                  <div className="flex items-center gap-1.5 text-[12px] text-fg-2">
                    <span className={cx("h-2 w-2 rounded-full", BAR[s])} aria-hidden />
                    {TRUST_LABEL[s]}
                  </div>
                  <div className="t-num mt-1 text-xl font-semibold">{count(s)}</div>
                </li>
              ))}
            </ul>
            {reqMissing > 0 && <p className="t-meta mt-3">{reqMissing} required field{reqMissing === 1 ? " is" : "s are"} not yet resolved.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader icon={ClipboardCheck} title="What needs attention" description="The same checks that gate approval." />
          <div className="p-4">
            <IssueList bundle={bundle} setTab={setTab} />
          </div>
        </Card>

        <Card>
          <CardHeader icon={FileText} title="Key details" actions={<button className="btn btn-ghost btn-sm" onClick={() => setTab("review")}>Review all fields <ArrowRight className="h-3 w-3" aria-hidden /></button>} />
          <dl className="divide-y divide-line">
            {shown.map(({ f, row }) => {
              const st = trustState(row);
              const src = bundle.sources.find((s) => s.id === row?.source_id);
              return (
                <div key={f.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr_auto] sm:items-start sm:gap-4">
                  <dt className="text-[12.5px] text-muted">{f.label}</dt>
                  <dd className="min-w-0 text-[13.5px]">
                    {row?.value ? <span className="line-clamp-2 break-words">{formatValue(f.type, row.value, def.dateFormat)}</span> : <span className="missing-mark">{st === "conflict" ? "Conflict — choose a value" : "Not provided"}</span>}
                    {src && (
                      <span className="mt-1 block">
                        <SourceBadge sourceId={src.id} filename={src.filename} page={row?.source_page} mime={src.mime_type} />
                      </span>
                    )}
                  </dd>
                  <dd>
                    <TrustBadge state={st} />
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      </div>

      <div className="space-y-5">
        <SummaryCard icon={FileStack} title="Evidence" onOpen={() => setTab("evidence")}>
          <Metric label="Documents" value={docs.length} />
          <Metric label="Pages with text" value={pages} />
          <Metric label="Photographs" value={docs.filter((s) => s.kind === "photo").length} />
          {ocrConf.length > 0 && <Metric label="Mean OCR confidence" value={`${(ocrConf.reduce((n, s) => n + Number(s.mean_confidence), 0) / ocrConf.length).toFixed(0)}%`} />}
        </SummaryCard>
        <SummaryCard icon={Users} title="Attendance" onOpen={() => setTab("attendance")} badge={<ReconBadge result={r.overall} ack={bundle.state.ackValid} />}>
          <Metric label="Stated total" value={r.stated.total ?? "Not provided"} />
          <Metric label="Rows on sheets" value={r.attendance.rows} />
          <Metric label="Verified rows" value={`${r.attendance.verifiedRows} of ${r.attendance.rows}`} />
        </SummaryCard>
        <SummaryCard icon={FileText} title="Reports" onOpen={() => setTab("reports")} badge={bundle.reports.length ? (bundle.state.blocking.some((b) => b.code === "reports_stale") ? <Badge tone="warning">Out of date</Badge> : <Badge tone="success">Current</Badge>) : <Badge>Not generated</Badge>}>
          <Metric label="Generated" value={bundle.reports.length ? fmtDateTime(bundle.state.latestReportsAt) : "—"} />
          <Metric label="Method" value="Deterministic template" />
        </SummaryCard>
        <Card className="px-4 py-3.5">
          <p className="t-caption mb-2">How this record is built</p>
          <PrincipleStrip className="flex-col items-start" />
        </Card>
      </div>
    </div>
  );
}

export function ReconBadge({ result, ack }: { result: string; ack?: boolean }) {
  if (ack && result === "FAIL") return <Badge tone="warning" icon={Info}>Mismatch acknowledged</Badge>;
  const map: Record<string, [string, Tone, LucideIcon]> = {
    PASS: ["Reconciled", "success", CheckCircle2],
    FAIL: ["Counts differ", "danger", AlertOctagon],
    UNVERIFIED: ["Rows unverified", "warning", AlertTriangle],
    INSUFFICIENT_DATA: ["Insufficient data", "neutral", Info],
  };
  const [l, t, i] = map[result] ?? [result, "neutral", Info];
  return (
    <Badge tone={t} icon={i} title={result}>
      {l}
    </Badge>
  );
}

function SummaryCard({ icon, title, onOpen, badge, children }: { icon: LucideIcon; title: string; onOpen: () => void; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} actions={badge} />
      <dl className="space-y-2 px-4 py-3">{children}</dl>
      <div className="border-t border-line px-4 py-2">
        <button className="btn btn-ghost btn-sm -ml-2" onClick={onOpen}>
          Open {title.toLowerCase()} <ArrowRight className="h-3 w-3" aria-hidden />
        </button>
      </div>
    </Card>
  );
}
function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="t-num text-right font-medium">{value}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- approval */
function ApprovalTab({ bundle, user, locked, refresh, setTab, feedback }: TabProps & { setTab: (t: string) => void; feedback: MyFeedback | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const a = bundle.activity;
  const blocked = bundle.state.blocking.length > 0;
  const run = async (action: string, extra: Record<string, string> = {}) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/activities/${a.id}/workflow`, { body: { action, ...extra } });
      setConfirmArchive(false);
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const checks: [string, boolean][] = [
    ["No conflicting values", !bundle.state.blocking.some((b) => b.code === "conflict")],
    ["Required fields provided", !bundle.state.blocking.some((b) => b.code === "required_missing")],
    ["Low-confidence values confirmed", !bundle.state.blocking.some((b) => b.code === "low_confidence")],
    ["Participant counts reconcile or are acknowledged", !bundle.state.blocking.some((b) => b.code === "reconciliation_failed")],
    ["No extraction still running", !bundle.state.blocking.some((b) => b.code === "extraction_running")],
    ["Reports generated from the current details", !bundle.state.blocking.some((b) => b.code === "reports_missing" || b.code === "reports_stale")],
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {locked && a.approved_at && (
        <div className="lg:col-span-5">
          <FeedbackCard activityId={a.id} existing={feedback} onSaved={refresh} />
        </div>
      )}
      <div className="space-y-5 lg:col-span-3">
        <Card>
          <CardHeader icon={ClipboardCheck} title="Approval readiness" description="Approval is blocked until every check passes." />
          <ul className="divide-y divide-line">
            {checks.map(([label, ok]) => (
              <li key={label} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px]">
                {ok ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : <AlertOctagon className="h-4 w-4 text-danger" aria-hidden />}
                <span className={ok ? "" : "font-medium"}>{label}</span>
                <span className="sr-only">{ok ? "passed" : "not passed"}</span>
              </li>
            ))}
          </ul>
        </Card>
        <IssueList bundle={bundle} setTab={setTab} />
      </div>
      <div className="space-y-5 lg:col-span-2">
        {!locked && (
          <Card className="p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand-line">
                <UserCheck className="h-4.5 w-4.5" aria-hidden />
              </span>
              <h2 className="t-section">Approve activity</h2>
            </div>
            <p className="t-body mt-3 text-fg-2">
              Approving records you as the approver with the current time and locks the activity. The system never approves automatically. Physical signatures are added on the printed documents — no signature is generated.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" icon={ShieldCheck} disabled={busy || blocked} onClick={() => run("approve")} loading={busy}>
                Approve
              </Button>
              <Button icon={Archive} disabled={busy} onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            </div>
            {blocked && <p className="mt-3 text-[12.5px] text-danger">Report cannot be approved until the blocking issues are resolved.</p>}
          </Card>
        )}
        {a.status === "APPROVED" && (
          <Card className="p-5">
            <div className="flex items-center gap-2 text-success">
              <ShieldCheck className="h-5 w-5" aria-hidden />
              <h2 className="t-section text-foreground">Approved</h2>
            </div>
            <p className="t-body mt-2">
              Approved by <strong>{bundle.approverName}</strong> on {fmtDateTime(a.approved_at)}.
            </p>
            <Button className="mt-4" icon={Archive} disabled={busy} onClick={() => setConfirmArchive(true)}>
              Archive
            </Button>
          </Card>
        )}
        {locked && user.role === "admin" && (
          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-muted" aria-hidden />
              <h2 className="t-card">Reopen (administrator)</h2>
            </div>
            <p className="t-meta">Reopening is audited with your reason and returns the activity to editing.</p>
            <label className="label" htmlFor="reopen-reason">Reason for reopening</label>
            <input id="reopen-reason" className="input" placeholder="Reason for reopening" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant="danger" icon={RotateCcw} disabled={busy || reason.trim().length < 5} onClick={() => run("reopen", { reason })}>
              Reopen for editing
            </Button>
          </Card>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
      <Modal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive this activity?"
        footer={
          <>
            <Button onClick={() => setConfirmArchive(false)}>Cancel</Button>
            <Button variant="primary" icon={Archive} loading={busy} onClick={() => run("archive")}>
              Archive
            </Button>
          </>
        }
      >
        <p className="t-body">It becomes read-only. Its documents, fields, reports and audit history are kept.</p>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------- audit */
const ACTION_TONE = (action: string): Tone =>
  action.includes("approved") ? "success" : action.includes("failed") || action.includes("deleted") || action.includes("reopen") ? "danger" : action.includes("conflict") ? "warning" : action.startsWith("field") ? "brand" : "neutral";

function describe(d: Record<string, unknown> | null | undefined): string | null {
  if (!d || typeof d !== "object") return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v == null || v === "") continue;
    const val = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k.replace(/_/g, " ")}: ${val.length > 120 ? `${val.slice(0, 120)}…` : val}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function AuditTab({ bundle }: { bundle: Bundle }) {
  if (!bundle.audit.length) return <Notice>No changes recorded yet.</Notice>;
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="t-section">Audit timeline</h2>
        <span className="t-meta">{bundle.audit.length} events · append-only</span>
      </div>
      <Timeline
        items={bundle.audit.map((e) => ({
          id: e.id,
          at: e.created_at,
          actor: e.actor_name ?? "System",
          action: AUDIT_LABELS[e.action] ?? e.action,
          tone: ACTION_TONE(e.action),
          detail: describe(e.details as Record<string, unknown>) ?? undefined,
        }))}
      />
    </Card>
  );
}

