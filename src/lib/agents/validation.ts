/**
 * Validation agent — step 3 of the agent pipeline (see docs/AGENTS_PLAN.md).
 *
 * The quote check in extraction proves a value is written in the document; it
 * cannot prove the value belongs to the field it was filed under (a poster's
 * event date offered as the notice issue date has a perfectly real quote).
 * This agent adds two things for dates, times and numbers:
 *
 *  1. explainConflict — a factual summary of which documents state which value
 *     (no model; nothing guessed about why they differ);
 *  2. checkRole — asks the model whether a candidate's quote actually states
 *     that field, and keeps the verdict only if the reason it cites is text
 *     from the quote.
 *
 * It never removes a candidate or picks a winner: a "different field" verdict is
 * a warning shown next to the candidate for the reviewer.
 */
import { chatJson, squash, type ChatConfig } from "../ai/provider";
import type { StoredCandidate } from "../fields/resolve";
import { SOURCE_KIND_LABELS, type TemplateField } from "../templates/schema";

export interface ConflictExplanation {
  field: string;
  groups: { value: string; sources: { kind: StoredCandidate["sourceKind"]; page: number }[] }[];
  message: string;
}

/** Which documents state which value. Null when the candidates agree. */
export function explainConflict(field: TemplateField, candidates: StoredCandidate[]): ConflictExplanation | null {
  const byValue = new Map<string, { value: string; sources: { kind: StoredCandidate["sourceKind"]; page: number }[] }>();
  for (const c of candidates) {
    const g = byValue.get(c.normalized) ?? { value: c.value, sources: [] };
    if (!g.sources.some((s) => s.kind === c.sourceKind && s.page === c.page)) g.sources.push({ kind: c.sourceKind, page: c.page });
    byValue.set(c.normalized, g);
  }
  if (byValue.size < 2) return null;
  const groups = [...byValue.values()].sort((a, b) => b.sources.length - a.sources.length);
  const where = (g: (typeof groups)[number]) => g.sources.map((s) => `${SOURCE_KIND_LABELS[s.kind]} p.${s.page}`).join(", ");
  const message = `${field.label}: ` + groups.map((g) => `${g.value} (${where(g)})`).join(" vs ") + ". Choose the correct value.";
  return { field: field.key, groups, message };
}

export type RoleVerdict = "states_field" | "different_field" | "unclear";

export interface RoleCheck {
  verdict: RoleVerdict;
  /** Text from the candidate's quote the verdict rests on (null when unclear). */
  evidence: string | null;
  reason: string;
}

/** Asks whether the candidate's quote states this field, or a different date/number. */
export async function checkRole(field: TemplateField, c: Pick<StoredCandidate, "value" | "sourceKind"> & { snippet: string }, cfg: ChatConfig): Promise<RoleCheck> {
  const prompt = `A value was read from a ${SOURCE_KIND_LABELS[c.sourceKind]} for the field "${field.label}"${field.help ? ` (${field.help})` : ""}.
Value: ${c.value}
Text it was read from: """${c.snippet.slice(0, 1200)}"""

Does this text state the value AS the ${field.label}, or is it a different ${field.type === "integer" ? "number" : field.type} (for example another event's date, an issue date, a deadline, a page or serial number)?
Answer "states_field", "different_field" or "unclear". As "evidence", copy the few words from the text that decide it, exactly as written.
Return JSON: {"verdict":"...","evidence":"...","reason":"<one short sentence>"}`;
  let a: { verdict?: unknown; evidence?: unknown; reason?: unknown };
  try {
    a = (await chatJson(cfg, prompt)) as typeof a;
  } catch (e) {
    return { verdict: "unclear", evidence: null, reason: e instanceof Error ? e.message : "LLM call failed" };
  }
  const verdict = a?.verdict;
  if (verdict !== "states_field" && verdict !== "different_field") return { verdict: "unclear", evidence: null, reason: "no clear answer" };
  const evidence = typeof a.evidence === "string" ? a.evidence.trim() : "";
  const ev = squash(evidence);
  if (ev.length < 3 || !squash(c.snippet).includes(ev)) return { verdict: "unclear", evidence: null, reason: "evidence not found in the text" };
  return { verdict, evidence: evidence.slice(0, 200), reason: typeof a.reason === "string" ? a.reason.slice(0, 300) : "" };
}

/** Fields whose candidates the role check applies to: dates, times and numbers. */
export function isCheckable(field: TemplateField): boolean {
  return field.type === "date" || field.type === "time" || field.type === "integer";
}
