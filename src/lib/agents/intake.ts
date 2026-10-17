/**
 * Intake agent — step 1 of the agent pipeline (see docs/AGENTS_PLAN.md).
 *
 * For every uploaded page it suggests what kind of document it is, and for the
 * activity as a whole it lists the documents the template's packet expects but
 * nobody has uploaded yet.
 *
 * Two classifiers run side by side:
 *  - rules: keyword/layout heuristics, always available, no model needed;
 *  - llm:   an OpenAI-compatible model, only when one is configured.
 * An LLM answer is kept only if its kind is one the product knows and its
 * supporting quote occurs verbatim in the page text; otherwise the rules answer
 * stands. When the two disagree the page is flagged for a person to check.
 *
 * The agent never changes the kind a faculty member chose. It only suggests,
 * always with the text that supports the suggestion.
 */
import { chatJson, squash, type ChatConfig } from "../ai/provider";
import type { PageText } from "../extraction/types";
import { SOURCE_KINDS, SOURCE_KIND_LABELS, type SourceKind, type TemplateDefinition } from "../templates/schema";

export interface KindSuggestion {
  kind: SourceKind;
  /** Text from the page that supports the suggestion (null when the page has no usable text). */
  quote: string | null;
  reason: string;
  method: "rules" | "llm";
}

export interface IntakeResult {
  suggestion: KindSuggestion;
  rules: KindSuggestion;
  /** The LLM answer as given, or why it was not used. */
  llm: KindSuggestion | { rejected: string } | null;
  /** True when the model and the rules disagree: a person should confirm the kind. */
  needsReview: boolean;
}

/** What each kind looks like, in plain words: shared by the rules and the LLM prompt. */
export const KIND_DESCRIPTIONS: Record<SourceKind, string> = {
  poster: "event poster or flyer: short, title of the event, organiser, date/venue, little running text",
  notice: "official notice or circular informing students/staff about an event, usually with a reference number and date",
  activity_report: "a filled-in FORM: mostly short 'label: value' entries (activity name, date, objective, outcome, participant counts, coordinator)",
  detailed_report: "a write-up in full sentences and paragraphs describing what happened at the event; few or no 'label: value' entries",
  attendance: "attendance sheet: a numbered list of participants with names, gender and/or signatures",
  photo: "photograph of the event; any text is only a caption or a GPS/camera overlay",
  supporting: "anything else: certificates, result or merit lists, evaluation or marks sheets, letters, permission or registration forms",
};

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function lineWith(text: string, re: RegExp): string | null {
  return lines(text).find((l) => re.test(l)) ?? null;
}

/** Keyword/layout heuristics. Deliberately generic: no wording specific to one college. */
export function classifyByRules(page: PageText): KindSuggestion {
  const text = page.text ?? "";
  const rule = (kind: SourceKind, quote: string | null, reason: string): KindSuggestion => ({ kind, quote, reason, method: "rules" });
  const numberedRows = lines(text).filter((l) => /^\d{1,3}\s*[.)|]?\s+\S/.test(l)).length;

  if (text.trim().length < 40) return rule("photo", null, "page has (almost) no text");
  let q = lineWith(text, /activity\s+report/i);
  if (q) return rule("activity_report", q, "heading 'activity report'");
  q = lineWith(text, /attendance|list of participants/i);
  if (q && numberedRows >= 5) return rule("attendance", q, `attendance heading and ${numberedRows} numbered rows`);
  if (numberedRows >= 10) return rule("attendance", null, `${numberedRows} numbered rows`);
  q = lineWith(text, /\b(notice|circular)\b|\b(are|is)\s+(hereby\s+)?informed\b/i);
  if (q) return rule("notice", q, "notice/circular wording");
  q = lineWith(text, /\breport\b/i);
  if (q && text.length >= 800) return rule("detailed_report", q, "'report' with running text");
  q = lineWith(text, /\b(photo|photograph|gps|lat(itude)?|long(itude)?)\b/i);
  if (q) return rule("photo", q, "photo caption or GPS overlay");
  q = lineWith(text, /\b(event|organi[sz]e[sd]?|invites?|presents|competition|celebrat\w*|venue)\b/i);
  if (q && text.length < 900) return rule("poster", q, "short text announcing an event");
  return rule("supporting", null, "no specific document pattern");
}

/** Asks the model for a kind plus a verbatim supporting quote, then checks both. */
export async function classifyWithLlm(page: PageText, cfg: ChatConfig): Promise<KindSuggestion | { rejected: string }> {
  const kinds = SOURCE_KINDS.map((k) => `${k}: ${KIND_DESCRIPTIONS[k]}`).join("\n");
  const prompt = `You sort documents uploaded for a college activity report. Decide which ONE kind this page is.
Kinds:\n${kinds}\n
Rules: choose exactly one kind from the list. As "quote", copy 3 to 8 consecutive words from the page text exactly as written, character for character, including OCR errors; do not correct, translate or paraphrase them. Use "" only for a photo with no readable text.
Return JSON: {"kind":"<kind>","quote":"<exact text>","reason":"<one short sentence>"}

Page text (OCR, may contain errors):\n${(page.text ?? "").slice(0, 6000)}`;
  let answer: { kind?: unknown; quote?: unknown; reason?: unknown };
  try {
    answer = (await chatJson(cfg, prompt)) as typeof answer;
  } catch (e) {
    return { rejected: e instanceof Error ? e.message : "LLM call failed" };
  }
  const kind = answer?.kind;
  if (typeof kind !== "string" || !(SOURCE_KINDS as readonly string[]).includes(kind)) return { rejected: `unknown kind "${String(kind)}"` };
  const quote = typeof answer.quote === "string" ? answer.quote.trim() : "";
  const reason = typeof answer.reason === "string" ? answer.reason.slice(0, 300) : "";
  if (!quote) {
    if (kind === "photo" && squash(page.text ?? "").length < 40) return { kind, quote: null, reason, method: "llm" };
    return { rejected: "no supporting quote" };
  }
  const q = squash(quote);
  if (q.length < 3 || !squash(page.text ?? "").includes(q)) return { rejected: "quote not found in page text" };
  return { kind: kind as SourceKind, quote: quote.slice(0, 300), reason, method: "llm" };
}

/** Classifies one page: the grounded LLM answer when available, otherwise the rules. */
export async function runIntake(page: PageText, cfg: ChatConfig | null): Promise<IntakeResult> {
  const rules = classifyByRules(page);
  if (!cfg) return { suggestion: rules, rules, llm: null, needsReview: false };
  const llm = await classifyWithLlm(page, cfg);
  if ("rejected" in llm) return { suggestion: rules, rules, llm, needsReview: true };
  return { suggestion: llm, rules, llm, needsReview: llm.kind !== rules.kind };
}

/** Kind of a multi-page document: the most frequent page suggestion (first page breaks ties). */
export function documentKind(pages: KindSuggestion[]): SourceKind | null {
  if (!pages.length) return null;
  const count = new Map<SourceKind, number>();
  for (const p of pages) count.set(p.kind, (count.get(p.kind) ?? 0) + 1);
  const best = Math.max(...count.values());
  return pages.find((p) => count.get(p.kind) === best)!.kind;
}

/**
 * Document kinds the template's packet includes that no upload provides.
 * "supporting" is optional and never reported as missing.
 */
export function missingKinds(def: TemplateDefinition, present: Iterable<string>): SourceKind[] {
  const have = new Set(present);
  const expected = def.packet.sections
    .map((s) => s.include)
    .filter((k): k is SourceKind => (SOURCE_KINDS as readonly string[]).includes(k) && k !== "supporting");
  return [...new Set(expected)].filter((k) => !have.has(k));
}

/** One-line request a faculty member can act on, e.g. "Missing: Notice, Attendance sheet". */
export function missingMessage(kinds: SourceKind[]): string | null {
  return kinds.length ? `Missing: ${kinds.map((k) => SOURCE_KIND_LABELS[k]).join(", ")}` : null;
}
