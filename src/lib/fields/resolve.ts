/**
 * Turns field candidates into one resolved state per template field.
 *
 * Rules (documented in ARCHITECTURE.md — there are no hidden heuristics):
 *  1. A value the user entered or confirmed is never overwritten by extraction.
 *  2. No candidates -> status "missing", value null.
 *  3. Dates, times and numbers: if candidates disagree -> status "conflicting",
 *     value null. The reviewer must choose. No automatic resolution.
 *  4. Text: candidates are ranked by (a) confidence band (>= 0.8 before
 *     below), then (b) template source priority, then (c) page. The top one is
 *     used; the others remain visible as alternatives. Differently worded text
 *     is not treated as a factual conflict.
 */
import type { SourceKind, TemplateDefinition, TemplateField } from "../templates/schema";

export type FieldStatus = "extracted" | "user_entered" | "inferred" | "missing" | "conflicting";

export interface StoredCandidate {
  id: string;
  fieldKey: string;
  value: string;
  normalized: string;
  sourceId: string;
  sourceKind: SourceKind;
  page: number;
  confidence: number;
  method: "deterministic_parser" | "llm";
}

export interface ExistingField {
  value: string | null;
  status: FieldStatus;
  editedBy: string | null;
}

export interface ResolvedField {
  fieldKey: string;
  value: string | null;
  status: FieldStatus;
  candidateId: string | null;
  sourceId: string | null;
  page: number | null;
  confidence: number | null;
  method: string | null;
  distinctValues: number;
}

const HIGH = 0.8;

export function rankCandidates(cands: StoredCandidate[], def: TemplateDefinition): StoredCandidate[] {
  const prio = (k: SourceKind) => {
    const i = def.sourcePriority.indexOf(k);
    return i < 0 ? 99 : i;
  };
  return [...cands].sort((a, b) => {
    const band = Number(b.confidence >= HIGH) - Number(a.confidence >= HIGH);
    if (band) return band;
    const p = prio(a.sourceKind) - prio(b.sourceKind);
    if (p) return p;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.page - b.page;
  });
}

export function resolveField(
  field: TemplateField,
  candidates: StoredCandidate[],
  existing: ExistingField | undefined,
  def: TemplateDefinition,
): ResolvedField | null {
  // Rule 1: user decisions stand.
  if (existing && existing.editedBy) return null;

  const distinct = new Set(candidates.map((c) => c.normalized));
  const base = { fieldKey: field.key, distinctValues: distinct.size };
  if (!candidates.length) {
    return { ...base, value: null, status: "missing", candidateId: null, sourceId: null, page: null, confidence: null, method: null };
  }
  const typed = field.type === "date" || field.type === "time" || field.type === "integer";
  if (typed && distinct.size > 1) {
    return { ...base, value: null, status: "conflicting", candidateId: null, sourceId: null, page: null, confidence: null, method: null };
  }
  const top = rankCandidates(candidates, def)[0];
  return {
    ...base,
    value: top.value,
    status: "extracted",
    candidateId: top.id,
    sourceId: top.sourceId,
    page: top.page,
    confidence: top.confidence,
    method: top.method,
  };
}
