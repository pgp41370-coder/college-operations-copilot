/**
 * AI provider abstraction.
 *
 * The product runs fully without a language model: DeterministicProvider uses
 * the rule-based parser, template drafting and deterministic validation, and
 * everything it produces is labelled "deterministic".
 *
 * An optional OpenAI-compatible adapter (works with any endpoint that speaks
 * the /chat/completions protocol — e.g. a local Ollama server or a free-tier
 * hosted model) can be enabled via environment variables. It is only used for
 * field extraction, and every value it returns must be backed by a verbatim
 * quote found in the page text, or it is discarded. LLM values are stored with
 * method "llm", capped below the confidence threshold, and therefore always
 * require reviewer confirmation. Report narrative is never written by a model.
 */
import { extractCandidates } from "../extraction/parser";
import type { FieldCandidate, PageText } from "../extraction/types";
import { findDates, findTimes, normalizeText, normalizeValue, textKey } from "../normalize";
import { assessReadiness, type ReadinessInput } from "../readiness";
import { buildActivityReport, buildDetailedReport, type FieldMap } from "../reports/build";
import type { TemplateDefinition } from "../templates/schema";

export interface ExtractionResult {
  candidates: FieldCandidate[];
  rejected: { field: string; reason: string }[];
}

export interface AIProvider {
  readonly mode: "deterministic" | "llm";
  readonly label: string;
  extractFields(pages: PageText[], def: TemplateDefinition): Promise<ExtractionResult>;
  generateDraft(def: TemplateDefinition, fields: FieldMap): ReturnType<typeof draft>;
  /** Summaries are not generated in the MVP; returns null rather than inventing text. */
  summarize(text: string): Promise<string | null>;
  validate(input: ReadinessInput): ReturnType<typeof assessReadiness>;
}

function draft(def: TemplateDefinition, fields: FieldMap) {
  return { activityReport: buildActivityReport(def, fields), detailedReport: buildDetailedReport(def, fields) };
}

export class DeterministicProvider implements AIProvider {
  readonly mode: "deterministic" | "llm" = "deterministic";
  readonly label: string = "Deterministic rules (no AI model)";
  async extractFields(pages: PageText[], def: TemplateDefinition): Promise<ExtractionResult> {
    return { candidates: extractCandidates(pages, def), rejected: [] };
  }
  generateDraft(def: TemplateDefinition, fields: FieldMap) {
    return draft(def, fields);
  }
  async summarize(): Promise<string | null> {
    return null;
  }
  validate(input: ReadinessInput) {
    return assessReadiness(input);
  }
}

export const LLM_MAX_CONFIDENCE = 0.6;

function squash(s: string) {
  return normalizeText(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Keeps an LLM-proposed value only when its quote occurs in the cited page and
 * the value itself is supported by the quote.
 */
export function groundLlmValue(
  item: { field: string; value: string; quote: string; page: number },
  pages: PageText[],
  def: TemplateDefinition,
): { ok: true; candidate: FieldCandidate } | { ok: false; reason: string } {
  const field = def.fields.find((f) => f.key === item.field);
  if (!field) return { ok: false, reason: "unknown field" };
  const page = pages.find((p) => p.page === item.page);
  if (!page) return { ok: false, reason: "cited page does not exist" };
  const q = squash(item.quote ?? "");
  if (q.length < 3 || !squash(page.text).includes(q)) return { ok: false, reason: "quote not found in page text" };
  const norm = normalizeValue(field.type, item.value);
  if (!norm.ok) return { ok: false, reason: norm.reason };
  let supported: boolean;
  if (field.type === "date") supported = findDates(item.quote).some((d) => d.iso === norm.value);
  else if (field.type === "time") supported = findTimes(item.quote).some((t) => t.hhmm === norm.value);
  else if (field.type === "integer") supported = new RegExp(`\\b0*${norm.value}\\b`).test(item.quote);
  else supported = squash(item.quote).includes(squash(norm.value));
  if (!supported) return { ok: false, reason: "value is not stated in the quote" };
  return {
    ok: true,
    candidate: {
      fieldKey: field.key,
      value: norm.value,
      normalized: field.type === "text" || field.type === "longtext" ? textKey(norm.value) : norm.value,
      sourceId: page.sourceId,
      page: page.page,
      confidence: LLM_MAX_CONFIDENCE,
      method: "llm",
      rule: "llm:grounded_quote",
      snippet: item.quote.slice(0, 1200),
    },
  };
}

export class OpenAICompatibleProvider extends DeterministicProvider {
  readonly mode = "llm" as const;
  readonly label: string;
  constructor(
    private baseUrl: string,
    private model: string,
    private apiKey: string | undefined,
    private fetchImpl: typeof fetch = fetch,
  ) {
    super();
    this.label = `LLM-assisted extraction (${model}, OpenAI-compatible endpoint)`;
  }

  async extractFields(pages: PageText[], def: TemplateDefinition): Promise<ExtractionResult> {
    const fields = def.fields.map((f) => `${f.key} (${f.type}): ${f.label}`).join("\n");
    const docs = pages.map((p) => `--- page ${p.page} (${p.kind}) ---\n${p.text.slice(0, 12000)}`).join("\n");
    const prompt = `Extract field values from the document text below.
Rules: Only report a value that is explicitly written in the text. Do not infer, guess, summarise or complete missing information.
For every value, copy the exact supporting text as "quote" and give the page number.
Return JSON: {"items":[{"field":"<key>","value":"<value>","quote":"<exact text>","page":<n>}]}. Omit fields that are not stated.
Fields:\n${fields}\n\nDocument:\n${docs}`;
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`LLM endpoint returned ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let items: { field: string; value: string; quote: string; page: number }[] = [];
    try {
      items = JSON.parse(body.choices?.[0]?.message?.content ?? "{}").items ?? [];
    } catch {
      throw new Error("LLM response was not valid JSON");
    }
    const out: ExtractionResult = { candidates: [], rejected: [] };
    for (const item of Array.isArray(items) ? items.slice(0, 200) : []) {
      if (typeof item?.value !== "string" || typeof item?.quote !== "string") continue;
      const g = groundLlmValue(item, pages, def);
      if (g.ok) out.candidates.push(g.candidate);
      else out.rejected.push({ field: String(item.field), reason: g.reason });
    }
    return out;
  }
}

export function aiStatus(): { mode: "deterministic" | "llm"; label: string } {
  const p = getProvider();
  return { mode: p.mode, label: p.label };
}

export function getProvider(): AIProvider {
  const kind = process.env.AI_PROVIDER;
  const base = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  if (kind === "openai_compatible" && base && model) {
    return new OpenAICompatibleProvider(base, model, process.env.AI_API_KEY || undefined);
  }
  return new DeterministicProvider();
}
