import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, FileStack, FileText, GitCompareArrows, ListChecks, MessageSquareText, Repeat, Star, Users } from "lucide-react";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { listFeedback, pilotMetrics } from "@/lib/server/feedback";
import { Badge, Card, CardHeader, EmptyState, fmtRelative, PageHeader, StatCard, type Tone } from "@/components/ui";

export const metadata = { title: "Pilot" };

const LABEL = {
  none: "No corrections",
  minor: "Minor corrections",
  major: "Major corrections",
  little: "Very little",
  some: "Some",
  most: "Most of it",
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
} as Record<string, string>;
const TONE: Record<string, Tone> = { none: "success", minor: "warning", major: "danger", little: "success", some: "warning", most: "danger", yes: "success", maybe: "warning", no: "danger" };

function Distribution({ title, counts }: { title: string; counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div>
      <p className="t-caption mb-2">{title}</p>
      <ul className="space-y-1.5">
        {Object.entries(counts).map(([k, n]) => (
          <li key={k} className="grid grid-cols-[120px_1fr_28px] items-center gap-2 text-[12.5px]">
            <span className="text-fg-2">{LABEL[k]}</span>
            <span className="h-2 rounded-full bg-surface-3">
              {total > 0 && <span className={`block h-2 rounded-full ${TONE[k] === "success" ? "bg-success" : TONE[k] === "warning" ? "bg-warning" : "bg-danger"}`} style={{ width: `${(n / total) * 100}%` }} />}
            </span>
            <span className="t-num text-right">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function PilotPage() {
  const user = await requirePageUser();
  if (user.role !== "admin") notFound();
  const sql = getSql();
  const [m, responses] = await Promise.all([pilotMetrics(sql, user), listFeedback(sql, user)]);
  const f = m.feedback;
  return (
    <>
      <PageHeader
        title="Pilot"
        description="Usage counted from the database and feedback given by faculty after approval. Nothing here is estimated. Test accounts (.invalid addresses) and smoke-test activities are excluded."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Users" value={m.users.total} hint={`${m.users.withActivity} with an activity · ${m.users.active} active accounts`} icon={Users} tone="brand" />
        <StatCard label="Activities" value={m.activities.total} hint={`${m.activities.approved} approved`} icon={ListChecks} tone="neutral" />
        <StatCard label="Documents" value={m.documents} hint={`${m.pagesRead} pages with text`} icon={FileStack} tone="neutral" />
        <StatCard label="Reports generated" value={m.reportsGenerated} hint="All versions" icon={FileText} tone="neutral" />
        <StatCard label="Conflicts detected" value={m.conflictsDetected} hint={`${m.conflictsResolvedByReviewer} resolved by a reviewer choosing a value`} icon={GitCompareArrows} tone="warning" />
        <StatCard label="Repeat users" value={m.users.repeat} hint="Two or more activities" icon={Repeat} tone="neutral" />
        <StatCard label="Feedback responses" value={f.responses} hint="One per person per activity" icon={MessageSquareText} tone="neutral" />
        <StatCard label="Average rating" value={f.averageRating == null ? "—" : `${f.averageRating.toFixed(1)} / 5`} hint={f.responses ? `from ${f.responses} response${f.responses === 1 ? "" : "s"}` : "No responses yet"} icon={Star} tone="success" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader icon={AlertTriangle} title="Answers" description="From the feedback form" />
          <div className="space-y-5 p-4">
            <Distribution title="Report needed corrections" counts={f.corrections} />
            <Distribution title="Manual work still needed" counts={f.manualEffort} />
            <Distribution title="Would use again" counts={f.wouldUseAgain} />
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader icon={MessageSquareText} title="Responses" description="Latest first. Themes are identified by reading these comments; they are not generated." />
          {responses.length === 0 ? (
            <EmptyState compact icon={MessageSquareText} title="No feedback yet">Faculty are asked for feedback on the Approve tab once an activity is approved.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {responses.map((r) => (
                <li key={r.id} className="px-4 py-3 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-0.5" aria-label={`${r.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={`h-3.5 w-3.5 ${n <= r.rating ? "fill-warning text-warning" : "text-line-strong"}`} aria-hidden />
                      ))}
                    </span>
                    <Link href={`/activities/${r.activity_id}?tab=approval`} className="font-medium hover:text-brand">{r.title ?? "Untitled activity"}</Link>
                    <span className="t-meta">{r.user_name ?? "Former user"} · {fmtRelative(r.updated_at)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={TONE[r.report_corrections]}>{LABEL[r.report_corrections]}</Badge>
                    <Badge tone={TONE[r.manual_effort]}>Manual work: {LABEL[r.manual_effort]}</Badge>
                    <Badge tone={TONE[r.would_use_again]}>Use again: {LABEL[r.would_use_again]}</Badge>
                  </div>
                  {r.worked_well && <p className="mt-2 text-fg-2"><span className="font-medium text-foreground">Worked well:</span> {r.worked_well}</p>}
                  {r.difficult && <p className="mt-1 text-fg-2"><span className="font-medium text-foreground">Difficult:</span> {r.difficult}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="t-meta mt-5">Voice feedback is not collected. Written answers are stored with the activity and visible only to administrators.</p>
    </>
  );
}
