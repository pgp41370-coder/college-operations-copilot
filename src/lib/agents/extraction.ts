/**
 * Extraction agent — step 2 of the agent pipeline (see docs/AGENTS_PLAN.md).
 * The model call itself lives in OpenAICompatibleProvider.extractFields; this
 * module decides which fields each document is asked for.
 *
 * Asking every document for every field is slow (the model has to answer for
 * all 22) and invites "real quote, wrong field" errors, e.g. a poster's event
 * date offered as the notice issue date. So a field that can only be printed on
 * certain kinds of document is only requested from those kinds. Fields not
 * listed here — including any custom template field — are requested from every
 * document.
 */
import type { SourceKind, TemplateDefinition, TemplateField } from "../templates/schema";

const REPORTS: SourceKind[] = ["activity_report", "detailed_report", "supporting"];

/** Field key -> the only document kinds that can state it. */
export const FIELD_SOURCES: Record<string, SourceKind[]> = {
  notice_date: ["notice"],
  report_date: ["detailed_report"],
  event_description: ["detailed_report"],
  impact_analysis: ["detailed_report"],
  brief: REPORTS,
  objectives: REPORTS,
  outcomes: REPORTS,
  session: [...REPORTS, "notice"],
  category: [...REPORTS, "notice"],
  male_count: [...REPORTS, "attendance"],
  female_count: [...REPORTS, "attendance"],
  total_count: [...REPORTS, "attendance"],
  hod_name: [...REPORTS, "notice"],
  iqac_coordinator_name: [...REPORTS, "notice"],
  principal_name: [...REPORTS, "notice"],
};

/** Template fields worth asking a document of this kind for. Photos are never asked. */
export function fieldsForKind(def: TemplateDefinition, kind: SourceKind): TemplateField[] {
  if (kind === "photo") return [];
  return def.fields.filter((f) => !FIELD_SOURCES[f.key] || FIELD_SOURCES[f.key].includes(kind));
}
