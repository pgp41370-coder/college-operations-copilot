/**
 * Report content builders. Output is plain data (stored as JSON and rendered to
 * HTML, DOCX and PDF). Every piece of text is either fixed template wording or
 * a field value; missing values render as "Not provided" — never invented.
 */
import { formatValue } from "../normalize";
import type { Reconciliation } from "../reconciliation";
import type { TemplateDefinition } from "../templates/schema";
import type { FieldStatus } from "../fields/resolve";

export const NOT_PROVIDED = "Not provided";
export const SIGNATURE_BLANK = "____________________";

export interface FieldValue {
  value: string | null;
  status: FieldStatus;
}

export type FieldMap = Record<string, FieldValue | undefined>;

export interface RenderedText {
  text: string;
  fields: string[];
  missing: string[];
}

export function renderPlaceholders(
  tpl: string,
  def: TemplateDefinition,
  fields: FieldMap,
  missingText: string | ((key: string) => string) = NOT_PROVIDED,
): RenderedText {
  const used: string[] = [];
  const missing: string[] = [];
  const text = tpl.replace(/\{([a-z0-9_.]+)\}/g, (_, key: string) => {
    if (key === "institution.name") return def.institution.name;
    if (key === "institution.department") return def.institution.department;
    used.push(key);
    const f = fields[key];
    const fieldDef = def.fields.find((d) => d.key === key);
    if (!f || f.value == null || f.value === "" || f.status === "conflicting") {
      missing.push(key);
      return typeof missingText === "function" ? missingText(key) : missingText;
    }
    return fieldDef ? formatValue(fieldDef.type, f.value, def.dateFormat) : f.value;
  });
  return { text, fields: used, missing };
}

export interface ReportRow {
  label: string;
  text: string;
  fields: string[];
  missing: string[];
}

export interface Signatory {
  heading: string;
  lines: string[];
}

export interface ActivityReportContent {
  type: "activity_report";
  titleLines: string[];
  heading: string;
  detailRows: ReportRow[];
  narrativeRows: ReportRow[];
  signatories: Signatory[];
  missing: string[];
}

export function buildActivityReport(def: TemplateDefinition, fields: FieldMap): ActivityReportContent {
  const ar = def.activityReport;
  const row = (r: { label: string; value: string }): ReportRow => {
    const out = renderPlaceholders(r.value, def, fields);
    return { label: r.label, text: out.text, fields: out.fields, missing: out.missing };
  };
  const detailRows = ar.detailRows.map(row);
  const narrativeRows = ar.narrativeRows.map(row);
  const titleLines = ar.titleLines.map((l) => renderPlaceholders(l, def, fields).text);
  const signatories = ar.signatories.map((s) => ({
    heading: s.heading,
    lines: s.lines.map((l) => renderPlaceholders(l, def, fields, SIGNATURE_BLANK).text),
  }));
  const missing = [...new Set([...detailRows, ...narrativeRows].flatMap((r) => r.missing))];
  return { type: "activity_report", titleLines, heading: ar.heading, detailRows, narrativeRows, signatories, missing };
}

type Origin = { kind: "field"; field: string } | { kind: "draft"; fields: string[] } | { kind: "missing" };

export interface DetailedReportContent {
  type: "detailed_report";
  letterheadLines: string[];
  dateLine: string;
  heading: string;
  topicLabel: string;
  topic: string;
  description: string;
  /** How the description was obtained. */
  descriptionOrigin: Origin;
  impactHeading: string;
  impact: string;
  impactOrigin: Origin;
  signatories: Signatory[];
  missing: string[];
}

function present(fields: FieldMap, key: string): string | null {
  const f = fields[key];
  if (!f || f.value == null || f.value.trim() === "" || f.status === "conflicting") return null;
  return f.value;
}

export function buildDetailedReport(def: TemplateDefinition, fields: FieldMap): DetailedReportContent {
  const dr = def.detailedReport;
  const labelOf = (k: string) => def.fields.find((f) => f.key === k)?.label ?? k;
  const missing = new Set<string>();

  const topicRendered = renderPlaceholders(`{${dr.topicField}}`, def, fields);
  topicRendered.missing.forEach((m) => missing.add(m));

  let description: string;
  let descriptionOrigin: Origin;
  const own = present(fields, dr.descriptionField);
  if (own) {
    description = own;
    descriptionOrigin = { kind: "field", field: dr.descriptionField };
  } else {
    const intro = renderPlaceholders(dr.descriptionDraft.intro, def, fields, (k) => `[${labelOf(k)} not provided]`);
    const appended = dr.descriptionDraft.appendFields.map((k) => present(fields, k)).filter((v): v is string => !!v);
    const introHasFacts = intro.fields.length > intro.missing.length;
    if (!introHasFacts && !appended.length) {
      description = `${NOT_PROVIDED}.`;
      descriptionOrigin = { kind: "missing" };
      missing.add(dr.descriptionField);
    } else {
      description = [intro.text, ...appended].join("\n\n");
      descriptionOrigin = { kind: "draft", fields: [...intro.fields, ...dr.descriptionDraft.appendFields] };
      intro.missing.forEach((m) => missing.add(m));
    }
  }

  let impact: string;
  let impactOrigin: Origin;
  const ownImpact = present(fields, dr.impactField);
  if (ownImpact) {
    impact = ownImpact;
    impactOrigin = { kind: "field", field: dr.impactField };
  } else {
    const parts = dr.impactDraftFields.map((k) => present(fields, k)).filter((v): v is string => !!v);
    if (parts.length) {
      impact = parts.join("\n\n");
      impactOrigin = { kind: "draft", fields: dr.impactDraftFields };
    } else {
      impact = `${NOT_PROVIDED}.`;
      impactOrigin = { kind: "missing" };
      missing.add(dr.impactField);
    }
  }

  return {
    type: "detailed_report",
    letterheadLines: dr.letterheadLines,
    dateLine: renderPlaceholders(dr.dateLine, def, fields, SIGNATURE_BLANK).text,
    heading: dr.heading,
    topicLabel: dr.topicLabel,
    topic: topicRendered.text,
    description,
    descriptionOrigin,
    impactHeading: dr.impactHeading,
    impact,
    impactOrigin,
    signatories: dr.signatories.map((s) => ({
      heading: s.heading,
      lines: s.lines.map((l) => renderPlaceholders(l, def, fields, SIGNATURE_BLANK).text),
    })),
    missing: [...missing],
  };
}

export interface AttendanceSummaryRow {
  serialNo: number | null;
  studentName: string;
  gender: string;
  method: string;
  verified: boolean;
  source: string | null;
}

export interface AttendanceSummaryContent {
  type: "attendance_summary";
  heading: string;
  title: string;
  activityDate: string;
  reconciliation: Reconciliation;
  rows: AttendanceSummaryRow[];
  sources: string[];
  acknowledgement: { note: string; by: string; at: string } | null;
}

export function buildAttendanceSummary(
  def: TemplateDefinition,
  fields: FieldMap,
  reconciliation: Reconciliation,
  rows: AttendanceSummaryRow[],
  acknowledgement: AttendanceSummaryContent["acknowledgement"],
): AttendanceSummaryContent {
  return {
    type: "attendance_summary",
    heading: "Attendance Summary",
    title: renderPlaceholders("{title}", def, fields).text,
    activityDate: renderPlaceholders("{activity_date}", def, fields).text,
    reconciliation,
    rows,
    sources: [...new Set(rows.map((r) => r.source).filter((s): s is string => !!s))],
    acknowledgement,
  };
}

export type ReportContent = ActivityReportContent | DetailedReportContent | AttendanceSummaryContent;
