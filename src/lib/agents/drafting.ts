/**
 * Drafting agent — step 4 of the agent pipeline (see docs/AGENTS_PLAN.md).
 *
 * Drafts a narrative field (e.g. "Brief about an Activity") from the activity's
 * current field values only. The model must say which fields each sentence uses;
 * a sentence is kept only if every number, month and capitalised name in it
 * appears in the values it cites (or, for names, in any provided value), and it
 * states no date the documents still disagree on. The
 * draft is a suggestion: it is never saved unless a reviewer accepts it, and an
 * accepted draft is recorded as a reviewer entry.
 */
import { chatJson, type ChatConfig } from "../ai/provider";
import type { TemplateDefinition, TemplateField } from "../templates/schema";

export interface DraftSentence {
  text: string;
  uses: string[];
}

export interface Draft {
  field: string;
  text: string;
  sentences: DraftSentence[];
  dropped: { text: string; reason: string }[];
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** Capitalised words that are ordinary English at a sentence or clause start, not facts. */
const COMMON = new Set(["the", "a", "an", "this", "these", "it", "its", "on", "in", "at", "of", "for", "to", "and", "with", "by", "during", "after", "before", "students", "participants", "faculty", "department", "college", "activity", "event", "programme", "program", "session"]);

const numbers = (s: string) => (s.match(/\d+/g) ?? []).map((n) => String(Number(n)));

/** Every month named in a date value (ISO yyyy-mm-dd). */
function monthsIn(v: string): string[] {
  return [...v.matchAll(/\b\d{4}-(\d{2})-\d{2}\b/g)].map((m) => MONTHS[Number(m[1]) - 1]).filter(Boolean);
}

/** True when `text` mentions the ISO date `iso` (yyyy-mm-dd) in a common written form. */
export function mentionsDate(text: string, iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return false;
  const t = text.toLowerCase();
  const month = MONTHS[m - 1];
  const numeric = new RegExp(`\\b0?${d}[/.-]0?${m}[/.-](${y}|${String(y).slice(2)})\\b`).test(t);
  const written = t.includes(String(y)) && t.includes(month) && new RegExp(`\\b0?${d}(st|nd|rd|th)?\\b`).test(t);
  return numeric || written;
}

/**
 * Why a sentence is not supported by the values it cites, or null if it is.
 * `disputed` lists dates (ISO) the documents disagree on: a draft may not state them.
 */
export function unsupported(sentence: DraftSentence, values: Record<string, string>, target: string, disputed: string[] = []): string | null {
  const date = disputed.find((iso) => mentionsDate(sentence.text, iso));
  if (date) return `states ${date}, a date the documents disagree on`;
  if (!sentence.uses.length) return "cites no field";
  for (const k of sentence.uses) {
    if (k === target) return "cites the field being drafted";
    if (!values[k]) return `cites "${k}", which has no value`;
  }
  const cited = sentence.uses.map((k) => values[k]).join(" \n ");
  const citedNums = new Set(numbers(cited));
  const n = numbers(sentence.text).find((x) => !citedNums.has(x));
  if (n) return `number ${n} is not in the cited values`;
  const lower = sentence.text.toLowerCase();
  const citedMonths = new Set([...monthsIn(cited), ...MONTHS.filter((m) => cited.toLowerCase().includes(m))]);
  const month = MONTHS.find((m) => new RegExp(`\\b${m}\\b`).test(lower) && !citedMonths.has(m));
  if (month) return `month ${month} is not in the cited values`;
  const all = Object.values(values).join(" \n ").toLowerCase();
  const words = sentence.text.split(/\s+/).slice(1).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, "").replace(/['’]s$/i, "").replace(/^['-]+|['-]+$/g, ""));
  const name = words.find((w) => /^\p{Lu}/u.test(w) && w.length > 1 && !COMMON.has(w.toLowerCase()) && !MONTHS.includes(w.toLowerCase()) && !all.includes(w.toLowerCase()));
  if (name) return `"${name}" is not in the provided values`;
  return null;
}

/**
 * Drafts `field` from `values` (field key -> current value). Only non-empty values
 * of other fields are given to the model.
 */
export async function draftNarrative(
  def: TemplateDefinition,
  field: TemplateField,
  fieldValues: Record<string, string>,
  cfg: ChatConfig,
  disputed: string[] = [],
): Promise<Draft | { rejected: string; dropped?: Draft["dropped"] }> {
  const facts = def.fields
    .filter((f) => f.key !== field.key && fieldValues[f.key])
    .map((f) => `${f.key} (${f.label}): ${fieldValues[f.key].slice(0, 1500)}`);
  if (facts.length < 2) return { rejected: "not enough confirmed details to draft from" };
  // The institution and department come from the template, not from a document field.
  const values = { ...fieldValues, institution: def.institution.name, department: def.institution.department };
  facts.push(`institution (Institution): ${def.institution.name}`, `department (Department): ${def.institution.department}`);
  const prompt = `Write the "${field.label}" section of a college activity report in 2 to 4 short, formal sentences.
Use ONLY the facts below. Do not add any fact, number, date, name, place or opinion that is not stated in them.
For each sentence, list the keys of the facts it uses in "uses".
Return JSON: {"sentences":[{"text":"<sentence>","uses":["<key>"]}]}

Facts:\n${facts.join("\n")}`;
  let answer: { sentences?: unknown };
  try {
    answer = (await chatJson(cfg, prompt)) as typeof answer;
  } catch (e) {
    return { rejected: e instanceof Error ? e.message : "LLM call failed" };
  }
  const raw = Array.isArray(answer?.sentences) ? answer.sentences.slice(0, 8) : [];
  const kept: DraftSentence[] = [];
  const dropped: Draft["dropped"] = [];
  for (const s of raw as { text?: unknown; uses?: unknown }[]) {
    if (typeof s?.text !== "string" || !s.text.trim()) continue;
    const sentence = { text: s.text.trim().slice(0, 600), uses: Array.isArray(s.uses) ? s.uses.filter((u): u is string => typeof u === "string") : [] };
    const why = unsupported(sentence, values, field.key, disputed);
    if (why) dropped.push({ text: sentence.text, reason: why });
    else kept.push(sentence);
  }
  if (!kept.length) return { rejected: dropped.length ? "every drafted sentence had an unsupported detail" : "the model returned no sentences", dropped };
  return { field: field.key, text: kept.map((s) => s.text).join(" "), sentences: kept, dropped };
}
