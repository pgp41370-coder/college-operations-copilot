import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  FilePen,
  HardDrive,
  Inbox,
  Info,
  ListChecks,
  Plus,
  ScanText,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { getSql } from "@/lib/db";
import { aiStatus } from "@/lib/ai/provider";
import { AUDIT_LABELS } from "@/lib/audit-labels";
import { listActivities } from "@/lib/server/activities";
import { requirePageUser } from "@/lib/server/auth";
import { attentionItems, pipelineCounts, systemIntegrity } from "@/lib/server/insights";
import { Badge, ButtonLink, Card, CardHeader, cx, Dot, EmptyState, fmtBytes, fmtRelative, PrincipleStrip, StatCard, StatusBadge } from "@/components/ui";
import { Greeting } from "./greeting";

export const metadata = { title: "Dashboard" };

const PIPELINE: { key: string; label: string }[] = [
  { key: "DRAFT", label: "Draft" },
  { key: "PROCESSING", label: "Processing" },
  { key: "REVIEW_REQUIRED", label: "Needs review" },
  { key: "READY_FOR_APPROVAL", label: "Ready for approval" },
  { key: "APPROVED", label: "Approved" },
];

export default async function Dashboard() {
  const user = await requirePageUser();
  const sql = getSql();
  const [counts, recent, attention, integrity, events] = await Promise.all([
    pipelineCounts(sql, user),
    listActivities(sql, user, { limit: 7 }),
    attentionItems(sql, user),
    systemIntegrity(sql, user),
    sql<{ id: string; action: string; created_at: Date; actor_name: string | null; activity_id: string | null; title: string | null }[]>`
      select l.id::text, l.action, l.created_at, u.name as actor_name, l.activity_id, a.display_title as title
      from audit_logs l left join users u on u.id = l.actor_id left join activities a on a.id = l.activity_id
      where l.activity_id is not null and (${user.role === "admin"} or a.owner_id = ${user.id})
      order by l.created_at desc limit 8`,
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const scope = user.role === "admin" ? "Across the institution" : "Activities you own";
  const critical = attention.filter((a) => a.severity === "critical").length;
  const ai = aiStatus();
  const maxStage = Math.max(1, ...PIPELINE.map((p) => counts[p.key] ?? 0));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Greeting name={user.name.split(" ")[0]} />
          <p className="mt-1 text-[13.5px] text-muted">
            {attention.length === 0 ? "Nothing needs your attention right now." : `Here's what needs your attention — ${attention.length} open item${attention.length === 1 ? "" : "s"}${critical ? `, ${critical} blocking` : ""}.`}
          </p>
        </div>
        <ButtonLink href="/activities/new" variant="primary" icon={Plus}>
          Create Activity
        </ButtonLink>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Activities" value={total} hint={scope} icon={ListChecks} tone="brand" href="/activities" />
        <StatCard label="Drafts" value={(counts.DRAFT ?? 0) + (counts.PROCESSING ?? 0)} hint="Being prepared" icon={FilePen} tone="neutral" href="/activities?status=DRAFT" />
        <StatCard label="Needs review" value={counts.REVIEW_REQUIRED ?? 0} hint={`${counts.READY_FOR_APPROVAL ?? 0} ready for approval`} icon={AlertTriangle} tone="warning" href="/activities?status=REVIEW_REQUIRED" />
        <StatCard label="Approved" value={counts.APPROVED ?? 0} hint={`${counts.ARCHIVED ?? 0} archived`} icon={CheckCircle2} tone="success" href="/activities?status=APPROVED" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader icon={Inbox} title="Needs attention" description="Blocking issues first. Each item comes from the same checks that gate approval." actions={attention.length > 0 ? <Badge tone={critical ? "danger" : "warning"}>{attention.length} open</Badge> : undefined} />
            {attention.length === 0 ? (
              <EmptyState compact icon={ShieldCheck} title="Everything is currently reconciled">No conflicts, missing required fields or count mismatches in open activities.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {attention.slice(0, 8).map((a, i) => {
                  const Icon = a.severity === "critical" ? AlertOctagon : a.severity === "warning" ? AlertTriangle : Info;
                  return (
                    <li key={`${a.activityId}-${i}`} className="flex items-start gap-3 px-4 py-3">
                      <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset", a.severity === "critical" ? "bg-danger-soft text-danger ring-danger-line" : a.severity === "warning" ? "bg-warning-soft text-warning ring-warning-line" : "bg-info-soft text-info ring-info-line")}>
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/activities/${a.activityId}`} className="truncate text-[13.5px] font-medium hover:text-brand">
                            {a.title ?? "Untitled activity"}
                          </Link>
                          <Badge tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "info"}>{a.severity === "critical" ? "Blocking" : a.severity === "warning" ? "Review" : "Info"}</Badge>
                        </div>
                        <p className="t-meta mt-0.5">{a.message}</p>
                      </div>
                      <ButtonLink href={`/activities/${a.activityId}?tab=${a.tab}`} size="sm">
                        Resolve <ArrowRight className="h-3 w-3" aria-hidden />
                      </ButtonLink>
                    </li>
                  );
                })}
              </ul>
            )}
            {attention.length > 8 && <p className="t-meta border-t border-line px-4 py-2.5">+{attention.length - 8} more in the activities list.</p>}
          </Card>

          <Card>
            <CardHeader icon={Clock3} title="Recent activity" actions={<ButtonLink href="/activities" size="sm" variant="ghost">View all <ArrowRight className="h-3 w-3" aria-hidden /></ButtonLink>} />
            {recent.length === 0 ? (
              <EmptyState compact icon={ListChecks} title="No activities yet" action={<ButtonLink href="/activities/new" variant="primary" icon={Plus}>Create Activity</ButtonLink>}>
                Your first activity record will appear here.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Activity</th>
                      <th>Status</th>
                      <th>Last updated</th>
                      {user.role === "admin" && <th>Owner</th>}
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((a) => (
                      <tr key={a.id}>
                        <td className="max-w-[320px]">
                          <Link href={`/activities/${a.id}`} className="block truncate font-medium hover:text-brand">
                            {a.display_title ?? <span className="italic text-muted">Untitled activity</span>}
                          </Link>
                          <span className="t-meta">{a.source_count} document{a.source_count === 1 ? "" : "s"}</span>
                        </td>
                        <td><StatusBadge status={a.status} /></td>
                        <td className="t-meta whitespace-nowrap" title={new Date(a.updated_at).toLocaleString("en-IN")}>{fmtRelative(a.updated_at)}</td>
                        {user.role === "admin" && <td className="whitespace-nowrap text-fg-2">{a.owner_name}</td>}
                        <td className="text-right"><ButtonLink href={`/activities/${a.id}`} size="sm">Open</ButtonLink></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader icon={Workflow} title="Workflow overview" description="Activities by stage (actual counts)" />
            <ol className="space-y-2.5 px-4 py-4">
              {PIPELINE.map((p, i) => {
                const n = counts[p.key] ?? 0;
                return (
                  <li key={p.key}>
                    <Link href={`/activities?status=${p.key}`} className="group block">
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="flex items-center gap-2 text-fg-2 group-hover:text-foreground">
                          <span className="t-num flex h-4 w-4 items-center justify-center rounded bg-surface-3 text-[10px] font-semibold text-muted">{i + 1}</span>
                          {p.label}
                        </span>
                        <span className="t-num font-semibold">{n}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-3">
                        <div className={cx("h-1.5 rounded-full transition-all", p.key === "APPROVED" ? "bg-success" : p.key === "REVIEW_REQUIRED" ? "bg-warning" : p.key === "READY_FOR_APPROVAL" ? "bg-brand" : "bg-subtle")} style={{ width: `${(n / maxStage) * 100}%` }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card>
            <CardHeader icon={ShieldCheck} title="System integrity" />
            <ul className="divide-y divide-line text-[12.5px]">
              <li className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="flex items-center gap-2 text-fg-2"><Database className="h-3.5 w-3.5 text-muted" aria-hidden /> Database</span>
                <span className="text-right">
                  <span className="flex items-center justify-end gap-1.5 font-medium text-success"><Dot tone="success" /> Connected</span>
                  <span className="t-meta">migrations {integrity.database.migrations} · {integrity.database.tables} tables · {integrity.database.ms} ms</span>
                </span>
              </li>
              <li className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="flex items-center gap-2 text-fg-2"><HardDrive className="h-3.5 w-3.5 text-muted" aria-hidden /> Storage</span>
                <span className="text-right">
                  <span className="font-medium">{integrity.storage.files} files · {fmtBytes(integrity.storage.bytes)}</span>
                  <span className="t-meta block">private, in database</span>
                </span>
              </li>
              <li className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="flex items-center gap-2 text-fg-2"><ScanText className="h-3.5 w-3.5 text-muted" aria-hidden /> OCR</span>
                <span className="text-right">
                  <span className="font-medium">In-browser · Tesseract</span>
                  <span className="t-meta block">{integrity.ocr.pages} pages read{integrity.ocr.meanConfidence != null ? ` · mean ${integrity.ocr.meanConfidence.toFixed(0)}% confidence` : ""}</span>
                </span>
              </li>
              <li className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="flex items-center gap-2 text-fg-2"><Bot className="h-3.5 w-3.5 text-muted" aria-hidden /> AI adapter</span>
                <span className="text-right">
                  {ai.mode === "llm" ? <Badge tone="info">On · grounded</Badge> : <Badge>Off</Badge>}
                  <span className="t-meta block">{ai.mode === "llm" ? "Suggestions require a verbatim quote" : "Deterministic rules only"}</span>
                </span>
              </li>
            </ul>
          </Card>

          <Card>
            <CardHeader icon={Clock3} title="Recent changes" actions={<ButtonLink href="/audit" size="sm" variant="ghost">Audit log</ButtonLink>} />
            {events.length === 0 ? (
              <p className="t-meta px-4 py-5">No changes recorded yet.</p>
            ) : (
              <ul className="space-y-2.5 px-4 py-3">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-2.5 text-[12.5px]">
                    <span className="mt-1.5"><Dot tone="brand" /></span>
                    <span className="min-w-0">
                      <span className="font-medium">{AUDIT_LABELS[e.action] ?? e.action}</span>
                      {e.activity_id && (
                        <>
                          {" · "}
                          <Link href={`/activities/${e.activity_id}?tab=audit`} className="text-fg-2 hover:text-brand">{e.title ?? "Untitled activity"}</Link>
                        </>
                      )}
                      <span className="t-meta block">{e.actor_name ?? "System"} · {fmtRelative(e.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface px-4 py-3">
        <PrincipleStrip />
      </div>
    </>
  );
}
