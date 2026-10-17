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
import { fieldsForKind } from "../agents/extraction";
import { extractCandidates } from "../extraction/parser";
import type { FieldCandidate, PageText } from "../extraction/types";
import { findDates, findTimes, normalizeText, normalizeValue, textKey } from "../normalize";
import { assessReadiness, type ReadinessInput } from "../readiness";
import { buildActivityReport, buildDetailedReport, type FieldMap } from "../reports/build";
import type { TemplateDefinition, TemplateField } from "../templates/schema";

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

export function squash(s: string) {
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

export interface ChatConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

/** One deterministic (temperature 0) JSON-mode call to an OpenAI-compatible /chat/completions endpoint. */
export async function chatJson(cfg: ChatConfig, prompt: string): Promise<unknown> {
  const res = await (cfg.fetchImpl ?? fetch)(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model: cfg.model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`LLM endpoint returned ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  try {
    return JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
  } catch {
    throw new Error("LLM response was not valid JSON");
  }
}

/** The configured language-model endpoint, or null when the product runs without one. */
export function chatConfig(): ChatConfig | null {
  const base = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  if (process.env.AI_PROVIDER !== "openai_compatible" || !base || !model) return null;
  return { baseUrl: base, model, apiKey: process.env.AI_API_KEY || undefined };
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

  /**
   * `pages` are the pages of one uploaded document; it is only asked for the fields its kind can state.
   * Short facts (dates, times, numbers, names) and long narrative fields go in separate requests: a
   * smaller request is answered faster and skips fewer fields. Narrative fields are only requested
   * when the rules found none, and come back as the verbatim passage only (the passage is the value).
   */
  async extractFields(pages: PageText[], def: TemplateDefinition): Promise<ExtractionResult> {
    const asked = pages.length ? fieldsForKind(def, pages[0].kind) : [];
    const out: ExtractionResult = { candidates: [], rejected: [] };
    // Narrative passages are long to write out (~10 tokens/s on a laptop model): ask for them only
    // when the rules found nothing. Short facts are always asked, as an independent check.
    const ruleKeys = new Set(extractCandidates(pages, def).map((c) => c.fieldKey));
    const short = asked.filter((f) => f.type !== "longtext");
    const long = asked.filter((f) => f.type === "longtext" && !ruleKeys.has(f.key));
    for (const [group, isLong] of [[short, false], [long, true]] as const) {
      if (!group.length) continue;
      const askedKeys = new Set(group.map((f) => f.key));
      for (const item of await this.ask(pages, group, isLong)) {
        if (typeof item?.quote !== "string") continue;
        if (isLong && typeof item.value !== "string") item.value = item.quote;
        if (typeof item.value !== "string") continue;
        if (def.fields.some((f) => f.key === item.field) && !askedKeys.has(item.field)) {
          out.rejected.push({ field: String(item.field), reason: "field not expected in this kind of document" });
          continue;
        }
        const g = groundLlmValue(item as { field: string; value: string; quote: string; page: number }, pages, def);
        if (g.ok) out.candidates.push(g.candidate);
        else out.rejected.push({ field: String(item.field), reason: g.reason });
      }
    }
    return out;
  }

  private async ask(pages: PageText[], fields: TemplateField[], long: boolean) {
    const list = fields.map((f) => `${f.key} (${f.type}): ${f.label}`).join("\n");
    const docs = pages.map((p) => `--- page ${p.page} (${p.kind}) ---\n${p.text.slice(0, 12000)}`).join("\n");
    const shape = long
      ? `For every field, copy the passage that states it, exactly as written, as "quote" and give the page number.
Return JSON: {"items":[{"field":"<key>","quote":"<exact passage>","page":<n>}]}. Omit fields that are not stated.`
      : `For every value, copy as "quote" the shortest exact text that contains it (at most 12 words) and give the page number. Check every field in the list.
Return JSON: {"items":[{"field":"<key>","value":"<value>","quote":"<exact text>","page":<n>}]}. Omit fields that are not stated.`;
    const prompt = `Extract field values from the document text below.
Rules: Only report a value that is explicitly written in the text. Do not infer, guess, summarise or complete missing information.
${shape}
Fields:\n${list}\n\nDocument:\n${docs}`;
    const answer = (await chatJson({ baseUrl: this.baseUrl, model: this.model, apiKey: this.apiKey, fetchImpl: this.fetchImpl }, prompt)) as {
      items?: { field: string; value?: string; quote: string; page: number }[];
    };
    return Array.isArray(answer.items) ? answer.items.slice(0, 200) : [];
  }
}

export function aiStatus(): { mode: "deterministic" | "llm"; label: string } {
  const p = getProvider();
  return { mode: p.mode, label: p.label };
}

export function getProvider(): AIProvider {
  const cfg = chatConfig();
  return cfg ? new OpenAICompatibleProvider(cfg.baseUrl, cfg.model, cfg.apiKey) : new DeterministicProvider();
}
