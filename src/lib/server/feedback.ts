/**
 * Pilot feedback and pilot metrics.
 *
 * Feedback is given by a person after an activity is approved. Metrics are
 * counted from the database; nothing is estimated. Test usage is excluded:
 * accounts on the reserved `.invalid` domain (automated smoke tests, demo
 * recordings) and activities titled "[SMOKE TEST] …".
 */
import { z } from "zod";
import type { User } from "./auth-core";
import { getActivity } from "./activities";
import { audit } from "./audit";
import { AppError } from "./errors";
import type { Db } from "./types";

export const REPORT_CORRECTIONS = ["none", "minor", "major"] as const;
export const MANUAL_EFFORT = ["little", "some", "most"] as const;
export const WOULD_USE_AGAIN = ["yes", "maybe", "no"] as const;

export const feedbackInput = z.object({
  rating: z.number().int().min(1).max(5),
  workedWell: z.string().trim().max(2000).optional(),
  difficult: z.string().trim().max(2000).optional(),
  reportCorrections: z.enum(REPORT_CORRECTIONS),
  manualEffort: z.enum(MANUAL_EFFORT),
  wouldUseAgain: z.enum(WOULD_USE_AGAIN),
});
export type FeedbackInput = z.infer<typeof feedbackInput>;

export interface FeedbackRow {
  id: string;
  activity_id: string;
  rating: number;
  worked_well: string | null;
  difficult: string | null;
  report_corrections: (typeof REPORT_CORRECTIONS)[number];
  manual_effort: (typeof MANUAL_EFFORT)[number];
  would_use_again: (typeof WOULD_USE_AGAIN)[number];
  created_at: Date;
  updated_at: Date;
}

/** The signed-in user's own feedback on an activity they can access. */
export async function getMyFeedback(sql: Db, user: User, activityId: string): Promise<FeedbackRow | null> {
  await getActivity(sql, user, activityId);
  const [f] = await sql<FeedbackRow[]>`
    select id, activity_id, rating, worked_well, difficult, report_corrections, manual_effort, would_use_again, created_at, updated_at
    from activity_feedback where activity_id = ${activityId} and user_id = ${user.id}`;
  return f ?? null;
}

/** Create or update the user's feedback. Only after the activity is approved. */
export async function submitFeedback(sql: Db, user: User, activityId: string, raw: unknown): Promise<FeedbackRow> {
  const input = feedbackInput.parse(raw);
  const a = await getActivity(sql, user, activityId);
  if (a.status !== "APPROVED" && a.status !== "ARCHIVED") {
    throw new AppError(409, "Feedback can be given once the activity has been approved.");
  }
  const [f] = await sql<(FeedbackRow & { inserted: boolean })[]>`
    insert into activity_feedback (activity_id, user_id, rating, worked_well, difficult, report_corrections, manual_effort, would_use_again)
    values (${activityId}, ${user.id}, ${input.rating}, ${input.workedWell || null}, ${input.difficult || null},
            ${input.reportCorrections}, ${input.manualEffort}, ${input.wouldUseAgain})
    on conflict (activity_id, user_id) do update set
      rating = excluded.rating, worked_well = excluded.worked_well, difficult = excluded.difficult,
      report_corrections = excluded.report_corrections, manual_effort = excluded.manual_effort,
      would_use_again = excluded.would_use_again, updated_at = now()
    returning id, activity_id, rating, worked_well, difficult, report_corrections, manual_effort, would_use_again, created_at, updated_at,
      (xmax = 0) as inserted`;
  // Free text is not copied into the audit log; only the structured answers.
  await audit(sql, {
    actorId: user.id,
    action: f.inserted ? "feedback.submitted" : "feedback.updated",
    activityId,
    entityType: "feedback",
    entityId: f.id,
    details: { rating: input.rating, reportCorrections: input.reportCorrections, manualEffort: input.manualEffort, wouldUseAgain: input.wouldUseAgain },
  });
  return {
    id: f.id,
    activity_id: f.activity_id,
    rating: f.rating,
    worked_well: f.worked_well,
    difficult: f.difficult,
    report_corrections: f.report_corrections,
    manual_effort: f.manual_effort,
    would_use_again: f.would_use_again,
    created_at: f.created_at,
    updated_at: f.updated_at,
  };
}

/** Real-usage filter shared by every pilot metric (see file comment). */
const REAL = (sql: Db) => sql`
  a.owner_id in (select id from users where lower(email) not like '%.invalid')
  and coalesce(a.display_title, '') not like '[SMOKE TEST]%'`;

export interface PilotMetrics {
  users: { total: number; active: number; withActivity: number; repeat: number };
  activities: { total: number; approved: number };
  documents: number;
  pagesRead: number;
  reportsGenerated: number;
  conflictsDetected: number;
  conflictsResolvedByReviewer: number;
  feedback: {
    responses: number;
    averageRating: number | null;
    corrections: Record<(typeof REPORT_CORRECTIONS)[number], number>;
    manualEffort: Record<(typeof MANUAL_EFFORT)[number], number>;
    wouldUseAgain: Record<(typeof WOULD_USE_AGAIN)[number], number>;
  };
}

function requireAdmin(user: User) {
  if (user.role !== "admin") throw new AppError(403, "Administrator access is required.");
}

export async function pilotMetrics(sql: Db, user: User): Promise<PilotMetrics> {
  requireAdmin(user);
  const real = REAL(sql);
  const [u] = await sql<{ total: number; active: number }[]>`
    select count(*)::int as total, count(*) filter (where is_active)::int as active from users where lower(email) not like '%.invalid'`;
  const [use] = await sql<{ with_activity: number; repeat: number }[]>`
    select count(*)::int as with_activity, count(*) filter (where n >= 2)::int as repeat
    from (select a.owner_id, count(*) as n from activities a where ${real} group by a.owner_id) t`;
  const [act] = await sql<{ total: number; approved: number }[]>`
    select count(*)::int as total, count(*) filter (where a.status in ('APPROVED', 'ARCHIVED') and a.approved_at is not null)::int as approved
    from activities a where ${real}`;
  const [docs] = await sql<{ docs: number; pages: number }[]>`
    select count(distinct s.id)::int as docs, count(e.id)::int as pages
    from sources s join activities a on a.id = s.activity_id left join source_extractions e on e.source_id = s.id where ${real}`;
  const [rep] = await sql<{ n: number }[]>`
    select count(*)::int as n from generated_reports r join activities a on a.id = r.activity_id where ${real}`;
  // A conflict = a field whose source documents gave two or more different values.
  const [conf] = await sql<{ n: number }[]>`
    select count(*)::int as n from (
      select c.activity_id, c.field_key from field_candidates c join activities a on a.id = c.activity_id
      where ${real} group by c.activity_id, c.field_key having count(distinct c.normalized) > 1) t`;
  const [resolved] = await sql<{ n: number }[]>`
    select count(*)::int as n from audit_logs l join activities a on a.id = l.activity_id
    where l.action = 'field.conflict_resolved' and ${real}`;
  const fb = await sql<{ rating: number; report_corrections: string; manual_effort: string; would_use_again: string }[]>`
    select f.rating, f.report_corrections, f.manual_effort, f.would_use_again
    from activity_feedback f join activities a on a.id = f.activity_id where ${real}`;
  const tally = <K extends string>(keys: readonly K[], pick: (r: (typeof fb)[number]) => string) =>
    Object.fromEntries(keys.map((k) => [k, fb.filter((r) => pick(r) === k).length])) as Record<K, number>;
  return {
    users: { total: u.total, active: u.active, withActivity: use.with_activity, repeat: use.repeat },
    activities: act,
    documents: docs.docs,
    pagesRead: docs.pages,
    reportsGenerated: rep.n,
    conflictsDetected: conf.n,
    conflictsResolvedByReviewer: resolved.n,
    feedback: {
      responses: fb.length,
      averageRating: fb.length ? fb.reduce((s, r) => s + r.rating, 0) / fb.length : null,
      corrections: tally(REPORT_CORRECTIONS, (r) => r.report_corrections),
      manualEffort: tally(MANUAL_EFFORT, (r) => r.manual_effort),
      wouldUseAgain: tally(WOULD_USE_AGAIN, (r) => r.would_use_again),
    },
  };
}

export async function listFeedback(sql: Db, user: User, limit = 100) {
  requireAdmin(user);
  return sql<(FeedbackRow & { user_name: string | null; title: string | null })[]>`
    select f.id, f.activity_id, f.rating, f.worked_well, f.difficult, f.report_corrections, f.manual_effort, f.would_use_again,
           f.created_at, f.updated_at, u.name as user_name, a.display_title as title
    from activity_feedback f join activities a on a.id = f.activity_id left join users u on u.id = f.user_id
    where ${REAL(sql)}
    order by f.updated_at desc limit ${limit}`;
}
