/**
 * Activity service. Every function takes the acting user and enforces access:
 * faculty see only their own activities; admins see all (institutional
 * oversight). Unauthorized access returns "not found" to avoid disclosure.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { parseAttendanceRows, flagDuplicateSerials } from "../extraction/attendance";
import { extractCandidates } from "../extraction/parser";
import type { FieldCandidate, PageText } from "../extraction/types";
import { resolveField, type FieldStatus, type StoredCandidate } from "../fields/resolve";
import { normalizeValue } from "../normalize";
import { assessReadiness, type Issue } from "../readiness";
import { reconcile, type Reconciliation } from "../reconciliation";
import {
  buildActivityReport,
  buildAttendanceSummary,
  buildDetailedReport,
  type FieldMap,
} from "../reports/build";
import { SOURCE_KINDS, validateTemplateDefinition, type SourceKind, type TemplateDefinition } from "../templates/schema";
import type { User } from "./auth-core";
import { audit } from "./audit";
import { AppError, notFound } from "./errors";
import { MAX_SOURCES_PER_ACTIVITY, validateUpload } from "./files";
import type { Db } from "./types";

export const STATUSES = ["DRAFT", "PROCESSING", "REVIEW_REQUIRED", "READY_FOR_APPROVAL", "APPROVED", "ARCHIVED"] as const;
export type ActivityStatus = (typeof STATUSES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An extraction marked "processing" longer than this is treated as abandoned. */
const EXTRACTION_STALE_MS = 15 * 60 * 1000;

export interface ActivityRow {
  id: string;
  owner_id: string;
  template_id: string;
  status: ActivityStatus;
  display_title: string | null;
  fields_updated_at: Date;
  reconciliation_ack: { note: string; by: string; byId: string; at: string; fingerprint: string } | null;
  approved_by: string | null;
  approved_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const trunc = (s: string | null | undefined, n = 200) => (s == null ? null : s.length > n ? `${s.slice(0, n)}…` : s);

// ---------------------------------------------------------------- templates

export async function loadTemplate(sql: Db, templateId: string): Promise<{ id: string; name: string; version: number; slug: string; def: TemplateDefinition }> {
  const [t] = await sql<{ id: string; name: string; version: number; slug: string; definition: unknown }[]>`
    select id, name, version, slug, definition from templates where id = ${templateId}`;
  if (!t) throw notFound("Template");
  const check = validateTemplateDefinition(t.definition);
  if (!check.ok) throw new AppError(500, `Template ${t.slug} v${t.version} is invalid: ${check.errors[0]}`);
  return { id: t.id, name: t.name, version: t.version, slug: t.slug, def: check.definition };
}

export async function defaultTemplateId(sql: Db): Promise<string> {
  const [t] = await sql<{ id: string }[]>`
    select id from templates where is_active order by slug, version desc limit 1`;
  if (!t) throw new AppError(500, "No active report template is configured.");
  return t.id;
}

// ---------------------------------------------------------------- access

export async function getActivity(sql: Db, user: User, id: string): Promise<ActivityRow> {
  if (!UUID.test(id)) throw notFound("Activity");
  const [a] = await sql<ActivityRow[]>`select * from activities where id = ${id}`;
  if (!a || (user.role !== "admin" && a.owner_id !== user.id)) throw notFound("Activity");
  return a;
}

function assertEditable(a: ActivityRow) {
  if (a.status === "APPROVED" || a.status === "ARCHIVED") {
    throw new AppError(409, `This activity is ${a.status.toLowerCase()} and can no longer be edited.`);
  }
}

async function touchFields(sql: Db, activityId: string) {
  await sql`update activities set fields_updated_at = clock_timestamp(), updated_at = now() where id = ${activityId}`;
}

// ---------------------------------------------------------------- listing

export interface ActivityListItem {
  id: string;
  status: ActivityStatus;
  display_title: string | null;
  owner_name: string;
  activity_date: string | null;
  source_count: number;
  created_at: Date;
  updated_at: Date;
}

export async function listActivities(sql: Db, user: User, opts: { status?: string; limit?: number } = {}): Promise<ActivityListItem[]> {
  const status = opts.status && (STATUSES as readonly string[]).includes(opts.status) ? opts.status : null;
  return sql<ActivityListItem[]>`
    select a.id, a.status, a.display_title, u.name as owner_name, a.created_at, a.updated_at,
      (select value from activity_fields f where f.activity_id = a.id and f.field_key = 'activity_date') as activity_date,
      (select count(*)::int from sources s where s.activity_id = a.id) as source_count
    from activities a join users u on u.id = a.owner_id
    where (${user.role === "admin"} or a.owner_id = ${user.id})
      and (${status}::text is null or a.status = ${status})
    order by a.updated_at desc
    limit ${opts.limit ?? 200}`;
}

export async function statusCounts(sql: Db, user: User): Promise<Record<string, number>> {
  const rows = await sql<{ status: string; n: number }[]>`
    select status, count(*)::int as n from activities
    where (${user.role === "admin"} or owner_id = ${user.id}) group by status`;
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

// ---------------------------------------------------------------- create

export const createActivityInput = z.object({
  templateId: z.string().regex(UUID).optional(),
  fields: z.record(z.string(), z.string().max(20000)).default({}),
});

export async function createActivity(sql: Db, user: User, input: z.infer<typeof createActivityInput>): Promise<string> {
  const templateId = input.templateId ?? (await defaultTemplateId(sql));
  const { def } = await loadTemplate(sql, templateId);
  const errors: string[] = [];
  const values: { key: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(input.fields)) {
    const field = def.fields.find((f) => f.key === key);
    if (!field) {
      errors.push(`Unknown field "${key}".`);
      continue;
    }
    if (!raw.trim()) continue;
    const norm = normalizeValue(field.type, raw, def.dateFormat === "MM/DD/YYYY" ? "MDY" : "DMY");
    if (!norm.ok) errors.push(`${field.label}: ${norm.reason}`);
    else values.push({ key, value: norm.value });
  }
  if (errors.length) throw new AppError(400, errors[0], errors);

  return sql.begin(async (tx) => {
    const [a] = await tx<{ id: string }[]>`
      insert into activities (owner_id, template_id) values (${user.id}, ${templateId}) returning id`;
    for (const v of values) {
      await tx`
        insert into activity_fields (activity_id, field_key, value, status, method, edited_by, edited_at)
        values (${a.id}, ${v.key}, ${v.value}, 'user_entered', 'manual', ${user.id}, now())`;
    }
    await recomputeFields(tx, a.id, def);
    await audit(tx, { actorId: user.id, action: "activity.created", activityId: a.id, entityType: "activity", entityId: a.id, details: { fieldsEntered: values.map((v) => v.key) } });
    await refreshStatus(tx, a.id);
    return a.id;
  }) as Promise<string>;
}

// ---------------------------------------------------------------- fields

interface FieldRow {
  field_key: string;
  value: string | null;
  status: FieldStatus;
  source_id: string | null;
  source_page: number | null;
  confidence: string | null;
  method: string | null;
  candidate_id: string | null;
  original_value: string | null;
  edited_by: string | null;
  edited_at: Date | null;
  note: string | null;
}

async function loadCandidates(sql: Db, activityId: string): Promise<(StoredCandidate & { filename: string; rule: string; snippet: string | null })[]> {
  const rows = await sql<{ id: string; field_key: string; value: string; normalized: string; source_id: string; kind: SourceKind; filename: string; page: number; confidence: string; method: "deterministic_parser" | "llm"; rule: string; snippet: string | null }[]>`
    select c.id, c.field_key, c.value, c.normalized, c.source_id, s.kind, s.filename, c.page, c.confidence, c.method, c.rule, c.snippet
    from field_candidates c join sources s on s.id = c.source_id where c.activity_id = ${activityId}
    order by c.field_key, c.confidence desc`;
  return rows.map((r) => ({
    id: r.id,
    fieldKey: r.field_key,
    value: r.value,
    normalized: r.normalized,
    sourceId: r.source_id,
    sourceKind: r.kind,
    filename: r.filename,
    page: r.page,
    confidence: Number(r.confidence),
    method: r.method,
    rule: r.rule,
    snippet: r.snippet,
  }));
}

/** Re-resolves every field from candidates. User decisions are never overwritten. */
export async function recomputeFields(sql: Db, activityId: string, def: TemplateDefinition) {
  const candidates = await loadCandidates(sql, activityId);
  const existing = new Map((await sql<FieldRow[]>`select * from activity_fields where activity_id = ${activityId}`).map((f) => [f.field_key, f]));
  for (const field of def.fields) {
    const ex = existing.get(field.key);
    const resolved = resolveField(
      field,
      candidates.filter((c) => c.fieldKey === field.key),
      ex ? { value: ex.value, status: ex.status, editedBy: ex.edited_by } : undefined,
      def,
    );
    if (!resolved) continue;
    await sql`
      insert into activity_fields (activity_id, field_key, value, status, source_id, source_page, confidence, method, candidate_id, updated_at)
      values (${activityId}, ${field.key}, ${resolved.value}, ${resolved.status}, ${resolved.sourceId}, ${resolved.page},
              ${resolved.confidence}, ${resolved.method}, ${resolved.candidateId}, now())
      on conflict (activity_id, field_key) do update set
        value = excluded.value, status = excluded.status, source_id = excluded.source_id, source_page = excluded.source_page,
        confidence = excluded.confidence, method = excluded.method, candidate_id = excluded.candidate_id, updated_at = now()`;
  }
  const [title] = await sql<{ value: string | null }[]>`
    select value from activity_fields where activity_id = ${activityId} and field_key = 'title'`;
  await sql`update activities set display_title = ${title?.value ?? null} where id = ${activityId}`;
}

export const setFieldInput = z.object({
  value: z.string().max(20000).nullable(),
  note: z.string().max(500).optional(),
});

export async function setField(sql: Db, user: User, activityId: string, key: string, input: z.infer<typeof setFieldInput>) {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  const { def } = await loadTemplate(sql, a.template_id);
  const field = def.fields.find((f) => f.key === key);
  if (!field) throw notFound("Field");
  let value: string | null = null;
  if (input.value != null && input.value.trim() !== "") {
    const norm = normalizeValue(field.type, input.value, def.dateFormat === "MM/DD/YYYY" ? "MDY" : "DMY");
    if (!norm.ok) throw new AppError(400, `${field.label}: ${norm.reason}`);
    value = norm.value;
  }
  await sql.begin(async (tx) => {
    const [ex] = await tx<FieldRow[]>`select * from activity_fields where activity_id = ${activityId} and field_key = ${key} for update`;
    const original = ex?.original_value ?? (ex?.status === "extracted" || ex?.status === "conflicting" ? ex.value : null);
    await tx`
      insert into activity_fields (activity_id, field_key, value, status, method, original_value, edited_by, edited_at, note, updated_at)
      values (${activityId}, ${key}, ${value}, ${value == null ? "missing" : "user_entered"}, 'manual', ${original},
              ${user.id}, now(), ${input.note ?? null}, now())
      on conflict (activity_id, field_key) do update set
        value = excluded.value, status = excluded.status, source_id = null, source_page = null, confidence = null,
        method = 'manual', candidate_id = null, original_value = excluded.original_value, edited_by = excluded.edited_by,
        edited_at = excluded.edited_at, note = excluded.note, updated_at = now()`;
    await audit(tx, {
      actorId: user.id,
      action: "field.edited",
      activityId,
      entityType: "field",
      entityId: key,
      details: { field: key, before: trunc(ex?.value), beforeStatus: ex?.status ?? "missing", after: trunc(value), note: input.note ?? null },
    });
    if (key === "title") await tx`update activities set display_title = ${value} where id = ${activityId}`;
    await touchFields(tx, activityId);
    await refreshStatus(tx, activityId);
  });
}

/** Reviewer picks one of the extracted candidates (resolves a conflict). */
export async function chooseCandidate(sql: Db, user: User, activityId: string, key: string, candidateId: string) {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  if (!UUID.test(candidateId)) throw notFound("Candidate");
  await sql.begin(async (tx) => {
    const [c] = await tx<{ id: string; value: string; source_id: string; page: number; confidence: string; method: string; filename: string }[]>`
      select c.id, c.value, c.source_id, c.page, c.confidence, c.method, s.filename
      from field_candidates c join sources s on s.id = c.source_id
      where c.id = ${candidateId} and c.activity_id = ${activityId} and c.field_key = ${key}`;
    if (!c) throw notFound("Candidate");
    const [ex] = await tx<FieldRow[]>`select * from activity_fields where activity_id = ${activityId} and field_key = ${key} for update`;
    await tx`
      update activity_fields set value = ${c.value}, status = 'extracted', source_id = ${c.source_id}, source_page = ${c.page},
        confidence = ${c.confidence}, method = ${c.method}, candidate_id = ${c.id}, edited_by = ${user.id}, edited_at = now(),
        note = 'Selected by reviewer from the extracted candidates', updated_at = now()
      where activity_id = ${activityId} and field_key = ${key}`;
    await audit(tx, {
      actorId: user.id,
      action: ex?.status === "conflicting" ? "field.conflict_resolved" : "field.edited",
      activityId,
      entityType: "field",
      entityId: key,
      details: { field: key, beforeStatus: ex?.status, before: trunc(ex?.value), chosen: trunc(c.value), source: c.filename, page: c.page },
    });
    if (key === "title") await tx`update activities set display_title = ${c.value} where id = ${activityId}`;
    await touchFields(tx, activityId);
    await refreshStatus(tx, activityId);
  });
}

/** Reviewer confirms an extracted value as correct (clears low-confidence flag). */
export async function confirmField(sql: Db, user: User, activityId: string, key: string) {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  await sql.begin(async (tx) => {
    const [ex] = await tx<FieldRow[]>`select * from activity_fields where activity_id = ${activityId} and field_key = ${key} for update`;
    if (!ex || ex.value == null || ex.status !== "extracted") {
      throw new AppError(409, "Only an extracted value can be confirmed. Edit the field instead.");
    }
    await tx`update activity_fields set edited_by = ${user.id}, edited_at = now(), note = 'Confirmed by reviewer', updated_at = now()
             where activity_id = ${activityId} and field_key = ${key}`;
    await audit(tx, { actorId: user.id, action: "field.confirmed", activityId, entityType: "field", entityId: key, details: { field: key, value: trunc(ex.value) } });
    await touchFields(tx, activityId);
    await refreshStatus(tx, activityId);
  });
}

// ---------------------------------------------------------------- sources

export const addSourceInput = z.object({
  kind: z.enum(SOURCE_KINDS),
  caption: z.string().max(300).optional(),
  sourceInfo: z.string().max(300).optional(),
});

export async function addSource(
  sql: Db,
  user: User,
  activityId: string,
  input: z.infer<typeof addSourceInput> & { filename: string; bytes: Uint8Array },
): Promise<{ id: string; extractionStatus: string; pageCount: number | null }> {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  const v = await validateUpload(input.filename, input.bytes);
  return sql.begin(async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from sources where activity_id = ${activityId}`;
    if (n >= MAX_SOURCES_PER_ACTIVITY) throw new AppError(409, `An activity can hold at most ${MAX_SOURCES_PER_ACTIVITY} documents.`);
    const [dup] = await tx<{ filename: string; kind: string }[]>`
      select filename, kind from sources where activity_id = ${activityId} and sha256 = ${v.sha256}`;
    if (dup) throw new AppError(409, `This file was already uploaded to this activity as "${dup.filename}".`);
    const extractionStatus = input.kind === "photo" ? "skipped" : "pending";
    const [s] = await tx<{ id: string }[]>`
      insert into sources (activity_id, kind, filename, mime_type, size_bytes, sha256, page_count, caption, source_info, extraction_status, uploaded_by)
      values (${activityId}, ${input.kind}, ${v.filename}, ${v.mime}, ${input.bytes.length}, ${v.sha256}, ${v.pageCount},
              ${input.caption?.trim() || null}, ${input.sourceInfo?.trim() || null}, ${extractionStatus}, ${user.id})
      returning id`;
    await tx`insert into source_blobs (source_id, data) values (${s.id}, ${Buffer.from(input.bytes)})`;
    await audit(tx, {
      actorId: user.id,
      action: "source.uploaded",
      activityId,
      entityType: "source",
      entityId: s.id,
      details: { filename: v.filename, kind: input.kind, sizeBytes: input.bytes.length, pages: v.pageCount },
    });
    await tx`update activities set updated_at = now() where id = ${activityId}`;
    await refreshStatus(tx, activityId);
    return { id: s.id, extractionStatus, pageCount: v.pageCount };
  }) as Promise<{ id: string; extractionStatus: string; pageCount: number | null }>;
}

export interface SourceRow {
  id: string;
  activity_id: string;
  kind: SourceKind;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  page_count: number | null;
  caption: string | null;
  source_info: string | null;
  extraction_status: "pending" | "processing" | "done" | "failed" | "skipped";
  extraction_error: string | null;
  extraction_updated_at: Date | null;
  uploaded_at: Date;
  uploaded_by_name: string | null;
}

export async function getSourceForUser(sql: Db, user: User, sourceId: string): Promise<{ source: SourceRow; activity: ActivityRow }> {
  if (!UUID.test(sourceId)) throw notFound("Document");
  const [s] = await sql<SourceRow[]>`
    select s.*, u.name as uploaded_by_name from sources s left join users u on u.id = s.uploaded_by where s.id = ${sourceId}`;
  if (!s) throw notFound("Document");
  try {
    const activity = await getActivity(sql, user, s.activity_id);
    return { source: s, activity };
  } catch {
    throw notFound("Document");
  }
}

export async function getSourceBytes(sql: Db, user: User, sourceId: string) {
  const { source } = await getSourceForUser(sql, user, sourceId);
  const [b] = await sql<{ data: Buffer }[]>`select data from source_blobs where source_id = ${sourceId}`;
  if (!b) throw notFound("Document file");
  return { source, data: b.data };
}

export async function updateSourceMeta(sql: Db, user: User, sourceId: string, input: { caption?: string | null; sourceInfo?: string | null }) {
  const { source, activity } = await getSourceForUser(sql, user, sourceId);
  assertEditable(activity);
  await sql`update sources set caption = ${input.caption?.trim() || null}, source_info = ${input.sourceInfo?.trim() || null} where id = ${sourceId}`;
  await audit(sql, { actorId: user.id, action: "source.caption_updated", activityId: activity.id, entityType: "source", entityId: source.id, details: { filename: source.filename } });
}

export async function deleteSource(sql: Db, user: User, sourceId: string) {
  const { source, activity } = await getSourceForUser(sql, user, sourceId);
  assertEditable(activity);
  const { def } = await loadTemplate(sql, activity.template_id);
  await sql.begin(async (tx) => {
    // OCR drafts from this document go with it; reviewed rows are kept.
    await tx`delete from attendance_records where source_id = ${sourceId} and method = 'ocr' and not verified`;
    await tx`delete from sources where id = ${sourceId}`;
    await recomputeFields(tx, activity.id, def);
    await audit(tx, { actorId: user.id, action: "source.deleted", activityId: activity.id, entityType: "source", entityId: sourceId, details: { filename: source.filename, kind: source.kind } });
    await touchFields(tx, activity.id);
    await refreshStatus(tx, activity.id);
  });
}

// ---------------------------------------------------------------- extraction

export const extractionPagesInput = z.object({
  engine: z.string().min(1).max(120),
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1).max(500),
        method: z.enum(["pdf_text", "ocr", "none"]),
        text: z.string().max(100_000),
        confidence: z.number().min(0).max(100).nullable(),
      }),
    )
    .min(1)
    .max(200),
});

export async function markExtraction(sql: Db, user: User, sourceId: string, status: "processing" | "failed", error?: string) {
  const { source, activity } = await getSourceForUser(sql, user, sourceId);
  assertEditable(activity);
  if (source.kind === "photo") throw new AppError(409, "Photographs are evidence attachments and are not processed.");
  await sql`update sources set extraction_status = ${status}, extraction_error = ${status === "failed" ? (error ?? "Extraction failed.").slice(0, 300) : null},
            extraction_updated_at = now() where id = ${sourceId}`;
  if (status === "failed") {
    await audit(sql, { actorId: user.id, action: "extraction.failed", activityId: activity.id, entityType: "source", entityId: sourceId, details: { filename: source.filename, error: (error ?? "").slice(0, 200) } });
  }
  await refreshStatus(sql, activity.id);
}

/** Stores per-page text from the browser extractor and re-runs the parser. */
export async function saveExtraction(sql: Db, user: User, sourceId: string, input: z.infer<typeof extractionPagesInput>) {
  const { source, activity } = await getSourceForUser(sql, user, sourceId);
  assertEditable(activity);
  if (source.kind === "photo") throw new AppError(409, "Photographs are evidence attachments and are not processed.");
  const total = input.pages.reduce((n, p) => n + p.text.length, 0);
  if (total > 1_000_000) throw new AppError(413, "Extracted text is too large.");
  const seen = new Set<number>();
  for (const p of input.pages) {
    if (source.page_count != null && p.page > source.page_count) throw new AppError(400, `Page ${p.page} does not exist in this document.`);
    if (seen.has(p.page)) throw new AppError(400, `Page ${p.page} was sent twice.`);
    seen.add(p.page);
  }
  const { def } = await loadTemplate(sql, activity.template_id);
  const readable = input.pages.filter((p) => p.text.replace(/\s/g, "").length >= 10);

  return sql.begin(async (tx) => {
    await tx`delete from source_extractions where source_id = ${sourceId}`;
    for (const p of input.pages) {
      await tx`insert into source_extractions (source_id, page, method, engine, text, confidence, created_by)
               values (${sourceId}, ${p.page}, ${p.method}, ${input.engine}, ${p.text}, ${p.confidence}, ${user.id})`;
    }
    const failed = readable.length === 0;
    await tx`update sources set extraction_status = ${failed ? "failed" : "done"},
             extraction_error = ${failed ? "Could not extract text from this file." : null}, extraction_updated_at = now()
             where id = ${sourceId}`;

    await regenerateCandidates(tx, activity.id, def);

    let attendanceRows = 0;
    if (source.kind === "attendance" && !failed) {
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from attendance_records where source_id = ${sourceId}`;
      if (n === 0) {
        const pages: PageText[] = input.pages.map((p) => ({ sourceId, kind: source.kind, filename: source.filename, page: p.page, text: p.text, method: p.method, confidence: p.confidence }));
        const rows = flagDuplicateSerials(pages.flatMap(parseAttendanceRows));
        for (const r of rows) {
          await tx`insert into attendance_records (activity_id, source_id, page, serial_no, student_name, gender, gender_raw, method, confidence, issues)
                   values (${activity.id}, ${sourceId}, ${r.page}, ${r.serialNo}, ${r.studentName}, ${r.gender}, ${r.genderRaw}, 'ocr', ${r.confidence}, ${r.issues})`;
        }
        attendanceRows = rows.length;
      }
    }

    await recomputeFields(tx, activity.id, def);
    await audit(tx, {
      actorId: user.id,
      action: failed ? "extraction.failed" : "extraction.completed",
      activityId: activity.id,
      entityType: "source",
      entityId: sourceId,
      details: {
        filename: source.filename,
        engine: input.engine,
        pages: input.pages.length,
        readablePages: readable.length,
        methods: [...new Set(input.pages.map((p) => p.method))],
        attendanceRowsDrafted: attendanceRows,
      },
    });
    await touchFields(tx, activity.id);
    await refreshStatus(tx, activity.id);
    return { status: failed ? "failed" : "done", readablePages: readable.length, attendanceRows };
  });
}

/** Re-runs the deterministic parser over every stored page of the activity. */
async function regenerateCandidates(sql: Db, activityId: string, def: TemplateDefinition) {
  const rows = await sql<{ source_id: string; kind: SourceKind; filename: string; page: number; text: string; method: "pdf_text" | "ocr" | "none"; confidence: string | null }[]>`
    select e.source_id, s.kind, s.filename, e.page, e.text, e.method, e.confidence
    from source_extractions e join sources s on s.id = e.source_id
    where s.activity_id = ${activityId} order by s.uploaded_at, e.page`;
  const pages: PageText[] = rows.map((r) => ({
    sourceId: r.source_id,
    kind: r.kind,
    filename: r.filename,
    page: r.page,
    text: r.text,
    method: r.method,
    confidence: r.confidence == null ? null : Number(r.confidence),
  }));
  const candidates = extractCandidates(pages, def);
  await sql`delete from field_candidates where activity_id = ${activityId} and method = 'deterministic_parser'`;
  await insertCandidates(sql, activityId, candidates);
}

export async function insertCandidates(sql: Db, activityId: string, candidates: FieldCandidate[]) {
  for (const c of candidates) {
    await sql`insert into field_candidates (activity_id, field_key, value, normalized, source_id, page, confidence, method, rule, snippet)
              values (${activityId}, ${c.fieldKey}, ${c.value}, ${c.normalized}, ${c.sourceId}, ${c.page}, ${c.confidence}, ${c.method}, ${c.rule}, ${c.snippet})`;
  }
}

// ---------------------------------------------------------------- attendance

export const attendanceRowInput = z.object({
  serialNo: z.number().int().min(1).max(10000).nullable(),
  studentName: z.string().trim().min(1).max(200),
  gender: z.enum(["male", "female", "unspecified"]),
  signaturePresent: z.boolean().nullable().optional(),
  sourceId: z.string().regex(UUID).nullable().optional(),
  page: z.number().int().min(1).max(500).nullable().optional(),
});

export interface AttendanceRow {
  id: string;
  source_id: string | null;
  source_filename: string | null;
  page: number | null;
  serial_no: number | null;
  student_name: string;
  gender: "male" | "female" | "unspecified";
  gender_raw: string | null;
  signature_present: boolean | null;
  method: "ocr" | "manual" | "csv";
  confidence: string | null;
  issues: string[];
  verified: boolean;
}

export async function listAttendance(sql: Db, activityId: string): Promise<AttendanceRow[]> {
  return sql<AttendanceRow[]>`
    select r.id, r.source_id, s.filename as source_filename, r.page, r.serial_no, r.student_name, r.gender, r.gender_raw,
           r.signature_present, r.method, r.confidence, r.issues, r.verified
    from attendance_records r left join sources s on s.id = r.source_id
    where r.activity_id = ${activityId} order by r.serial_no nulls last, r.created_at`;
}

async function assertSourceInActivity(sql: Db, activityId: string, sourceId: string | null | undefined) {
  if (!sourceId) return;
  const [s] = await sql`select 1 from sources where id = ${sourceId} and activity_id = ${activityId}`;
  if (!s) throw new AppError(400, "The referenced document does not belong to this activity.");
}

export async function addAttendanceRow(sql: Db, user: User, activityId: string, input: z.infer<typeof attendanceRowInput>) {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  await assertSourceInActivity(sql, activityId, input.sourceId);
  await sql.begin(async (tx) => {
    const [r] = await tx<{ id: string }[]>`
      insert into attendance_records (activity_id, source_id, page, serial_no, student_name, gender, signature_present, method, verified, verified_by, verified_at)
      values (${activityId}, ${input.sourceId ?? null}, ${input.page ?? null}, ${input.serialNo}, ${input.studentName}, ${input.gender},
              ${input.signaturePresent ?? null}, 'manual', true, ${user.id}, now())
      returning id`;
    await audit(tx, { actorId: user.id, action: "attendance.row_added", activityId, entityType: "attendance", entityId: r.id, details: { serialNo: input.serialNo } });
    await touchFields(tx, activityId);
    await refreshStatus(tx, activityId);
  });
}

export async function updateAttendanceRow(
  sql: Db,
  user: User,
  activityId: string,
  rowId: string,
  input: Partial<z.infer<typeof attendanceRowInput>> & { verified?: boolean },
) {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  if (!UUID.test(rowId)) throw notFound("Attendance row");
  await sql.begin(async (tx) => {
    const [r] = await tx<AttendanceRow[]>`select * from attendance_records where id = ${rowId} and activity_id = ${activityId} for update`;
    if (!r) throw notFound("Attendance row");
    const contentChanged =
      (input.studentName !== undefined && input.studentName !== r.student_name) ||
      (input.gender !== undefined && input.gender !== r.gender) ||
      (input.serialNo !== undefined && input.serialNo !== r.serial_no);
    const verified = input.verified ?? r.verified;
    await tx`
      update attendance_records set
        serial_no = ${input.serialNo !== undefined ? input.serialNo : r.serial_no},
        student_name = ${input.studentName ?? r.student_name},
        gender = ${input.gender ?? r.gender},
        signature_present = ${input.signaturePresent !== undefined ? input.signaturePresent : r.signature_present},
        issues = ${contentChanged ? ["Edited by reviewer"] : r.issues},
        verified = ${verified},
        verified_by = ${verified ? user.id : null},
        verified_at = ${verified ? new Date() : null}
      where id = ${rowId}`;
    await audit(tx, {
      actorId: user.id,
      action: "attendance.row_updated",
      activityId,
      entityType: "attendance",
      entityId: rowId,
      details: { serialNo: r.serial_no, contentChanged, verified },
    });
    await touchFields(tx, activityId);
    await refreshStatus(tx, activityId);
  });
}

export async function deleteAttendanceRow(sql: Db, user: User, activityId: string, rowId: string) {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  if (!UUID.test(rowId)) throw notFound("Attendance row");
  await sql.begin(async (tx) => {
    const res = await tx`delete from attendance_records where id = ${rowId} and activity_id = ${activityId} returning serial_no`;
    if (!res.length) throw notFound("Attendance row");
    await audit(tx, { actorId: user.id, action: "attendance.row_deleted", activityId, entityType: "attendance", entityId: rowId, details: { serialNo: res[0].serial_no } });
    await touchFields(tx, activityId);
    await refreshStatus(tx, activityId);
  });
}

export async function verifyAllAttendance(sql: Db, user: User, activityId: string) {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  await sql.begin(async (tx) => {
    const res = await tx`update attendance_records set verified = true, verified_by = ${user.id}, verified_at = now()
                         where activity_id = ${activityId} and not verified returning id`;
    await audit(tx, { actorId: user.id, action: "attendance.rows_verified", activityId, entityType: "attendance", details: { rows: res.length } });
    await touchFields(tx, activityId);
    await refreshStatus(tx, activityId);
  });
}

/**
 * CSV import: header row required with columns serial/name/gender (any order).
 * Gender must be written explicitly (male/female/M/F); otherwise "unspecified".
 */
export function parseAttendanceCsv(csv: string): { rows: z.infer<typeof attendanceRowInput>[]; errors: string[] } {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  if (!lines.length) return { rows: [], errors: ["The CSV is empty."] };
  const split = (l: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') {
        if (q && l[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iSerial = col(["sr", "serial", "s.no", "no"]);
  const iName = col(["name"]);
  const iGender = col(["gender", "sex"]);
  if (iName < 0) return { rows: [], errors: ["CSV header must include a 'name' column."] };
  const rows: z.infer<typeof attendanceRowInput>[] = [];
  lines.slice(1).forEach((line, idx) => {
    const cells = split(line);
    const name = cells[iName]?.trim();
    if (!name) {
      errors.push(`Row ${idx + 2}: missing name.`);
      return;
    }
    const serialRaw = iSerial >= 0 ? cells[iSerial] : "";
    const serial = /^\d+$/.test(serialRaw ?? "") ? Number(serialRaw) : null;
    const g = (iGender >= 0 ? cells[iGender] : "").toLowerCase();
    const gender = g === "male" || g === "m" ? "male" : g === "female" || g === "f" ? "female" : "unspecified";
    rows.push({ serialNo: serial, studentName: name.slice(0, 200), gender });
  });
  if (rows.length > 2000) return { rows: [], errors: ["CSV has more than 2000 rows."] };
  return { rows, errors };
}

export async function importAttendanceCsv(sql: Db, user: User, activityId: string, csv: string) {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  const { rows, errors } = parseAttendanceCsv(csv);
  if (!rows.length) throw new AppError(400, errors[0] ?? "No rows found in the CSV.", errors);
  await sql.begin(async (tx) => {
    for (const r of rows) {
      await tx`insert into attendance_records (activity_id, serial_no, student_name, gender, method)
               values (${activityId}, ${r.serialNo}, ${r.studentName}, ${r.gender}, 'csv')`;
    }
    await audit(tx, { actorId: user.id, action: "attendance.csv_imported", activityId, entityType: "attendance", details: { rows: rows.length, skipped: errors.length } });
    await touchFields(tx, activityId);
    await refreshStatus(tx, activityId);
  });
  return { imported: rows.length, errors };
}

// ---------------------------------------------------------------- state

export function reconciliationFingerprint(r: Reconciliation): string {
  return createHash("sha256")
    .update(JSON.stringify([r.stated, r.attendance.rows, r.attendance.male, r.attendance.female, r.attendance.unspecified]))
    .digest("hex")
    .slice(0, 16);
}

export interface ActivityState {
  def: TemplateDefinition;
  fields: FieldRow[];
  fieldMap: FieldMap;
  reconciliation: Reconciliation;
  ackValid: boolean;
  blocking: Issue[];
  warnings: Issue[];
  computedStatus: ActivityStatus;
  latestReportsAt: Date | null;
}

export async function computeState(sql: Db, a: ActivityRow): Promise<ActivityState> {
  const { def } = await loadTemplate(sql, a.template_id);
  const fields = await sql<FieldRow[]>`select * from activity_fields where activity_id = ${a.id}`;
  const byKey = Object.fromEntries(fields.map((f) => [f.field_key, f]));
  const fieldMap: FieldMap = Object.fromEntries(fields.map((f) => [f.field_key, { value: f.value, status: f.status }]));
  const rows = await sql<{ gender: string; verified: boolean }[]>`select gender, verified from attendance_records where activity_id = ${a.id}`;
  const reconciliation = reconcile(
    {
      male: byKey[def.attendance.maleField]?.value,
      female: byKey[def.attendance.femaleField]?.value,
      total: byKey[def.attendance.totalField]?.value,
    },
    rows,
  );
  const ackValid = !!a.reconciliation_ack && a.reconciliation_ack.fingerprint === reconciliationFingerprint(reconciliation);
  const sources = await sql<{ filename: string; extraction_status: string; kind: string; extraction_updated_at: Date | null }[]>`
    select filename, extraction_status, kind, extraction_updated_at from sources where activity_id = ${a.id}`;
  const [rep] = await sql<{ at: Date | null }[]>`
    select max(generated_at) as at from generated_reports where activity_id = ${a.id} and report_type = 'activity_report'`;
  const latestReportsAt = rep?.at ?? null;
  const { blocking, warnings } = assessReadiness({
    def,
    fields: Object.fromEntries(
      fields.map((f) => [f.field_key, { value: f.value, status: f.status, confidence: f.confidence == null ? null : Number(f.confidence), editedBy: f.edited_by }]),
    ),
    reconciliation,
    reconciliationAcknowledged: ackValid,
    sources: sources.map((s) => ({
      filename: s.filename,
      kind: s.kind,
      extractionStatus:
        s.extraction_status === "processing" && s.extraction_updated_at && Date.now() - s.extraction_updated_at.getTime() > EXTRACTION_STALE_MS
          ? "failed"
          : s.extraction_status,
    })),
    reportsGeneratedAt: latestReportsAt,
    fieldsUpdatedAt: a.fields_updated_at,
  });
  let computedStatus: ActivityStatus;
  if (blocking.some((b) => b.code === "extraction_running")) computedStatus = "PROCESSING";
  else if (!blocking.length) computedStatus = "READY_FOR_APPROVAL";
  else if (!latestReportsAt) computedStatus = "DRAFT";
  else computedStatus = "REVIEW_REQUIRED";
  return { def, fields, fieldMap, reconciliation, ackValid, blocking, warnings, computedStatus, latestReportsAt };
}

/** Recomputes the workflow status. Approved/archived activities are left alone. */
export async function refreshStatus(sql: Db, activityId: string) {
  const [a] = await sql<ActivityRow[]>`select * from activities where id = ${activityId}`;
  if (!a || a.status === "APPROVED" || a.status === "ARCHIVED") return;
  const state = await computeState(sql, a);
  if (state.computedStatus !== a.status) {
    await sql`update activities set status = ${state.computedStatus}, updated_at = now() where id = ${activityId}`;
  }
}

export async function acknowledgeReconciliation(sql: Db, user: User, activityId: string, note: string) {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  const trimmed = note.trim();
  if (trimmed.length < 10) throw new AppError(400, "Explain the mismatch in at least 10 characters.");
  const state = await computeState(sql, a);
  if (state.reconciliation.overall !== "FAIL") throw new AppError(409, "Participant counts currently reconcile; nothing to acknowledge.");
  const ack = { note: trimmed.slice(0, 1000), by: user.name, byId: user.id, at: new Date().toISOString(), fingerprint: reconciliationFingerprint(state.reconciliation) };
  await sql.begin(async (tx) => {
    await tx`update activities set reconciliation_ack = ${tx.json(ack)}, updated_at = now() where id = ${activityId}`;
    await audit(tx, { actorId: user.id, action: "reconciliation.acknowledged", activityId, entityType: "activity", entityId: activityId, details: { note: trunc(trimmed), messages: state.reconciliation.messages } });
    await touchFields(tx, activityId);
    await refreshStatus(tx, activityId);
  });
}

// ---------------------------------------------------------------- reports

export async function generateReports(sql: Db, user: User, activityId: string) {
  const a = await getActivity(sql, user, activityId);
  assertEditable(a);
  const state = await computeState(sql, a);
  const rows = await listAttendance(sql, activityId);
  const ack = state.ackValid && a.reconciliation_ack ? { note: a.reconciliation_ack.note, by: a.reconciliation_ack.by, at: a.reconciliation_ack.at } : null;
  const contents = [
    buildActivityReport(state.def, state.fieldMap),
    buildDetailedReport(state.def, state.fieldMap),
    buildAttendanceSummary(
      state.def,
      state.fieldMap,
      state.reconciliation,
      rows.map((r) => ({ serialNo: r.serial_no, studentName: r.student_name, gender: r.gender, method: r.method, verified: r.verified, source: r.source_filename })),
      ack,
    ),
  ];
  return sql.begin(async (tx) => {
    const versions: Record<string, number> = {};
    for (const c of contents) {
      const [{ v }] = await tx<{ v: number }[]>`
        select coalesce(max(version), 0) + 1 as v from generated_reports where activity_id = ${activityId} and report_type = ${c.type}`;
      await tx`insert into generated_reports (activity_id, report_type, version, content, generator, generated_by, generated_at)
               values (${activityId}, ${c.type}, ${v}, ${tx.json(c as never)}, 'template:deterministic', ${user.id}, clock_timestamp())`;
      versions[c.type] = v;
    }
    await audit(tx, { actorId: user.id, action: "report.generated", activityId, entityType: "report", details: { versions, missingFields: contents[0].type === "activity_report" ? contents[0].missing : [] } });
    await tx`update activities set updated_at = now() where id = ${activityId}`;
    await refreshStatus(tx, activityId);
    return versions;
  });
}

export interface ReportRecord {
  id: string;
  report_type: "activity_report" | "detailed_report" | "attendance_summary";
  version: number;
  content: unknown;
  generator: string;
  generated_at: Date;
  generated_by_name: string | null;
}

export async function latestReports(sql: Db, activityId: string): Promise<ReportRecord[]> {
  return sql<ReportRecord[]>`
    select distinct on (r.report_type) r.id, r.report_type, r.version, r.content, r.generator, r.generated_at, u.name as generated_by_name
    from generated_reports r left join users u on u.id = r.generated_by
    where r.activity_id = ${activityId} order by r.report_type, r.version desc`;
}

// ---------------------------------------------------------------- approval

export async function approveActivity(sql: Db, user: User, activityId: string) {
  const a = await getActivity(sql, user, activityId);
  if (a.status === "APPROVED") throw new AppError(409, "This activity is already approved.");
  if (a.status === "ARCHIVED") throw new AppError(409, "Archived activities cannot be approved.");
  const state = await computeState(sql, a);
  if (state.blocking.length) {
    throw new AppError(409, "Report cannot be approved until required fields are resolved.", state.blocking.map((b) => b.message));
  }
  const reports = await latestReports(sql, activityId);
  await sql.begin(async (tx) => {
    await tx`update activities set status = 'APPROVED', approved_by = ${user.id}, approved_at = now(), updated_at = now() where id = ${activityId}`;
    await audit(tx, {
      actorId: user.id,
      action: "activity.approved",
      activityId,
      entityType: "activity",
      entityId: activityId,
      details: { reportVersions: Object.fromEntries(reports.map((r) => [r.report_type, r.version])), warnings: state.warnings.map((w) => w.message) },
    });
  });
}

export async function archiveActivity(sql: Db, user: User, activityId: string) {
  const a = await getActivity(sql, user, activityId);
  if (a.status === "ARCHIVED") throw new AppError(409, "This activity is already archived.");
  await sql.begin(async (tx) => {
    await tx`update activities set status = 'ARCHIVED', archived_at = now(), updated_at = now() where id = ${activityId}`;
    await audit(tx, { actorId: user.id, action: "activity.archived", activityId, entityType: "activity", entityId: activityId, details: { previousStatus: a.status } });
  });
}

export async function reopenActivity(sql: Db, user: User, activityId: string, reason: string) {
  if (user.role !== "admin") throw new AppError(403, "Only an administrator can reopen an approved or archived activity.");
  const a = await getActivity(sql, user, activityId);
  if (a.status !== "APPROVED" && a.status !== "ARCHIVED") throw new AppError(409, "Only approved or archived activities can be reopened.");
  if (reason.trim().length < 5) throw new AppError(400, "Give a reason for reopening.");
  await sql.begin(async (tx) => {
    await tx`update activities set status = 'REVIEW_REQUIRED', approved_by = null, approved_at = null, archived_at = null, updated_at = now() where id = ${activityId}`;
    await audit(tx, { actorId: user.id, action: "activity.reopened", activityId, entityType: "activity", entityId: activityId, details: { previousStatus: a.status, reason: trunc(reason) } });
    await refreshStatus(tx, activityId);
  });
}

// ---------------------------------------------------------------- bundle for UI

export async function loadActivityBundle(sql: Db, user: User, activityId: string) {
  const activity = await getActivity(sql, user, activityId);
  const template = await loadTemplate(sql, activity.template_id);
  const state = await computeState(sql, activity);
  const candidates = await loadCandidates(sql, activityId);
  const sources = await sql<(SourceRow & { pages_extracted: number; methods: string[] | null; mean_confidence: string | null })[]>`
    select s.id, s.activity_id, s.kind, s.filename, s.mime_type, s.size_bytes, s.sha256, s.page_count, s.caption, s.source_info,
           s.extraction_status, s.extraction_error, s.extraction_updated_at, s.uploaded_at, u.name as uploaded_by_name,
           (select count(*)::int from source_extractions e where e.source_id = s.id) as pages_extracted,
           (select array_agg(distinct e.method) from source_extractions e where e.source_id = s.id) as methods,
           (select avg(e.confidence) from source_extractions e where e.source_id = s.id) as mean_confidence
    from sources s left join users u on u.id = s.uploaded_by where s.activity_id = ${activityId} order by s.uploaded_at`;
  const attendance = await listAttendance(sql, activityId);
  const reports = await latestReports(sql, activityId);
  const [owner] = await sql<{ name: string }[]>`select name from users where id = ${activity.owner_id}`;
  const [approver] = activity.approved_by ? await sql<{ name: string }[]>`select name from users where id = ${activity.approved_by}` : [];
  const editors = await sql<{ id: string; name: string }[]>`
    select id, name from users where id in (select edited_by from activity_fields where activity_id = ${activityId} and edited_by is not null)`;
  const auditRows = await sql<{ id: string; action: string; details: Record<string, unknown>; created_at: Date; actor_name: string | null }[]>`
    select l.id::text, l.action, l.details, l.created_at, u.name as actor_name
    from audit_logs l left join users u on u.id = l.actor_id where l.activity_id = ${activityId} order by l.created_at desc limit 200`;
  return {
    activity,
    ownerName: owner?.name ?? "Unknown",
    approverName: approver?.name ?? null,
    template: { id: template.id, name: template.name, version: template.version },
    state,
    candidates,
    sources,
    attendance,
    reports,
    editors: Object.fromEntries(editors.map((e) => [e.id, e.name])),
    audit: auditRows,
  };
}
