/**
 * Orchestrator — step 5 of the agent pipeline (see docs/AGENTS_PLAN.md).
 *
 * agentChecks: the rule-based agent output shown on every activity page
 *   (document-kind check, missing documents, conflict explanations). No model.
 * runAgents: runs Intake -> Extraction -> Validation -> Drafting in order for
 *   one activity. Steps that need a language model are skipped, and say so,
 *   when none is configured. Nothing is approved, resolved or saved on the
 *   reviewer's behalf except the model's extraction candidates, which go
 *   through the same conflict/confidence rules as every other value.
 */
import { chatConfig, getProvider, type ChatConfig } from "../ai/provider";
import { draftNarrative, type Draft } from "../agents/drafting";
import { documentKind, missingKinds, runIntake, type KindSuggestion } from "../agents/intake";
import { checkRole, explainConflict, isCheckable, type ConflictExplanation, type RoleVerdict } from "../agents/validation";
import type { PageText } from "../extraction/types";
import { SOURCE_KIND_LABELS, type SourceKind, type TemplateDefinition } from "../templates/schema";
import { computeState, getActivity, loadCandidates, loadTemplate } from "./activities";
import { runLlmExtraction } from "./ai-extraction";
import { audit } from "./audit";
import type { User } from "./auth-core";
import type { Db, Sql } from "./types";

export interface IntakeCheck {
  sourceId: string;
  uploadedAs: SourceKind;
  suggested: SourceKind;
  quote: string | null;
  reason: string;
  method: KindSuggestion["method"];
}

export interface AgentChecks {
  intake: IntakeCheck[];
  missing: SourceKind[];
  conflicts: ConflictExplanation[];
}

async function sourcePages(sql: Db, activityId: string): Promise<Map<string, PageText[]>> {
  const rows = await sql<{ source_id: string; kind: SourceKind; filename: string; page: number; text: string; method: PageText["method"]; confidence: string | null }[]>`
    select e.source_id, s.kind, s.filename, e.page, e.text, e.method, e.confidence
    from source_extractions e join sources s on s.id = e.source_id
    where s.activity_id = ${activityId} and s.kind <> 'photo' order by e.source_id, e.page`;
  const out = new Map<string, PageText[]>();
  for (const r of rows) {
    const p: PageText = { sourceId: r.source_id, kind: r.kind, filename: r.filename, page: r.page, text: r.text, method: r.method, confidence: r.confidence == null ? null : Number(r.confidence) };
    out.set(r.source_id, [...(out.get(r.source_id) ?? []), p]);
  }
  return out;
}

async function intakeFor(pages: PageText[], uploadedAs: SourceKind, cfg: ChatConfig | null): Promise<IntakeCheck & { needsReview: boolean }> {
  const results = [];
  for (const p of pages) results.push(await runIntake(p, cfg));
  const suggested = documentKind(results.map((r) => r.suggestion)) ?? uploadedAs;
  const best = results.find((r) => r.suggestion.kind === suggested)!.suggestion;
  return { sourceId: pages[0].sourceId, uploadedAs, suggested, quote: best.quote, reason: best.reason, method: best.method, needsReview: results.some((r) => r.needsReview) };
}

/** Rule-based agent output for the activity page. */
export async function agentChecks(
  sql: Db,
  activityId: string,
  def: TemplateDefinition,
  sources: { id: string; kind: SourceKind }[],
  candidates: Parameters<typeof explainConflict>[1],
  fields: { field_key: string; status: string }[],
): Promise<AgentChecks> {
  const intake: IntakeCheck[] = [];
  for (const [sourceId, pages] of await sourcePages(sql, activityId)) {
    const s = sources.find((x) => x.id === sourceId);
    if (!s || !pages.some((p) => p.text.trim())) continue;
    const check = await intakeFor(pages, s.kind, null);
    intake.push({ sourceId: check.sourceId, uploadedAs: check.uploadedAs, suggested: check.suggested, quote: check.quote, reason: check.reason, method: check.method });
  }
  const conflicts: ConflictExplanation[] = [];
  for (const f of fields.filter((x) => x.status === "conflicting")) {
    const field = def.fields.find((x) => x.key === f.field_key);
    const e = field && explainConflict(field, candidates.filter((c) => c.fieldKey === f.field_key));
    if (e) conflicts.push(e);
  }
  return { intake, missing: missingKinds(def, sources.map((s) => s.kind)), conflicts };
}

export interface AgentStep {
  agent: "intake" | "extraction" | "validation" | "drafting";
  status: "done" | "skipped" | "failed";
  summary: string;
}

export interface AgentRun {
  at: string;
  model: string | null;
  steps: AgentStep[];
  intake: IntakeCheck[];
  missing: SourceKind[];
  conflicts: ConflictExplanation[];
  roleWarnings: { field: string; candidateId: string; value: string; verdict: RoleVerdict; evidence: string | null; reason: string }[];
  drafts: Draft[];
  needsReview: number;
}

const NO_MODEL = "Skipped: no AI model is connected to this deployment.";

export async function runAgents(sql: Sql, user: User, activityId: string, cfg: ChatConfig | null = chatConfig()): Promise<AgentRun> {
  const a = await getActivity(sql, user, activityId);
  const editable = a.status !== "APPROVED" && a.status !== "ARCHIVED";
  const { def } = await loadTemplate(sql, a.template_id);
  const steps: AgentStep[] = [];
  const sources = await sql<{ id: string; kind: SourceKind }[]>`select id, kind from sources where activity_id = ${activityId}`;

  // 1. Intake
  const intake: IntakeCheck[] = [];
  let intakeReview = 0;
  for (const [sourceId, pages] of await sourcePages(sql, activityId)) {
    const s = sources.find((x) => x.id === sourceId);
    if (!s || !pages.some((p) => p.text.trim())) continue;
    const { needsReview, ...check } = await intakeFor(pages, s.kind, cfg);
    if (needsReview) intakeReview++;
    intake.push(check);
  }
  const missing = missingKinds(def, sources.map((s) => s.kind));
  const mismatched = intake.filter((i) => i.suggested !== i.uploadedAs).length;
  steps.push({
    agent: "intake",
    status: "done",
    summary: `${intake.length} document(s) checked${cfg ? "" : " by rules"}; ${mismatched} may be labelled with the wrong type${intakeReview ? `; ${intakeReview} where model and rules disagree` : ""}; ${missing.length ? `missing: ${missing.map((k) => SOURCE_KIND_LABELS[k]).join(", ")}` : "no expected document missing"}.`,
  });

  // 2. Extraction (model)
  if (!cfg) steps.push({ agent: "extraction", status: "skipped", summary: NO_MODEL });
  else if (!editable) steps.push({ agent: "extraction", status: "skipped", summary: "Skipped: the activity is approved or archived." });
  else if (!intake.length) steps.push({ agent: "extraction", status: "skipped", summary: "Skipped: no document text extracted yet." });
  else {
    try {
      const r = await runLlmExtraction(sql, user, activityId, getProvider());
      steps.push({ agent: "extraction", status: "done", summary: `${r.accepted} value(s) backed by a quote added for review; ${r.rejected} rejected by the quote check.` });
    } catch (e) {
      steps.push({ agent: "extraction", status: "failed", summary: e instanceof Error ? e.message : "Extraction failed." });
    }
  }

  // 3. Validation
  const state = await computeState(sql, a);
  const candidates = await loadCandidates(sql, activityId);
  const conflicts: ConflictExplanation[] = [];
  for (const f of state.fields.filter((x) => x.status === "conflicting")) {
    const field = def.fields.find((x) => x.key === f.field_key);
    const e = field && explainConflict(field, candidates.filter((c) => c.fieldKey === f.field_key));
    if (e) conflicts.push(e);
  }
  const roleWarnings: AgentRun["roleWarnings"] = [];
  if (cfg) {
    const toCheck = candidates.filter((c) => c.method === "llm" && c.snippet && isCheckable(def.fields.find((f) => f.key === c.fieldKey)!)).slice(0, 20);
    for (const c of toCheck) {
      const r = await checkRole(def.fields.find((f) => f.key === c.fieldKey)!, { value: c.value, sourceKind: c.sourceKind, snippet: c.snippet! }, cfg);
      if (r.verdict === "different_field") roleWarnings.push({ field: c.fieldKey, candidateId: c.id, value: c.value, ...r });
    }
  }
  steps.push({
    agent: "validation",
    status: "done",
    summary: `${conflicts.length} conflict(s) explained${cfg ? `; ${roleWarnings.length} model value(s) look like a different field` : " (model field check skipped: no AI model connected)"}.`,
  });

  // 4. Drafting (model): only narrative fields that are still empty
  const drafts: Draft[] = [];
  if (!cfg) steps.push({ agent: "drafting", status: "skipped", summary: NO_MODEL });
  else if (!editable) steps.push({ agent: "drafting", status: "skipped", summary: "Skipped: the activity is approved or archived." });
  else {
    const values = Object.fromEntries(state.fields.filter((f) => f.value && f.status !== "conflicting").map((f) => [f.field_key, f.value!]));
    const empty = def.fields.filter((f) => f.type === "longtext" && !values[f.key]).slice(0, 3);
    const disputed = conflicts.filter((c) => def.fields.find((f) => f.key === c.field)?.type === "date").flatMap((c) => c.groups.map((g) => g.value));
    const notes: string[] = [];
    for (const f of empty) {
      const d = await draftNarrative(def, f, values, cfg, disputed);
      if ("rejected" in d) notes.push(`${f.label}: ${d.rejected}`);
      else drafts.push(d);
    }
    steps.push({
      agent: "drafting",
      status: "done",
      summary: empty.length ? `${drafts.length} draft(s) ready for review${notes.length ? `; ${notes.join("; ")}` : ""}.` : "Nothing to draft: every narrative field has a value.",
    });
  }

  const run: AgentRun = {
    at: new Date().toISOString(),
    model: cfg?.model ?? null,
    steps,
    intake,
    missing,
    conflicts,
    roleWarnings,
    drafts,
    needsReview: mismatched + intakeReview + conflicts.length + roleWarnings.length + drafts.length,
  };
  await audit(sql, { actorId: user.id, action: "agents.run", activityId, entityType: "activity", entityId: activityId, details: { model: run.model, steps: steps.map((s) => ({ agent: s.agent, status: s.status, summary: s.summary })) } });
  return run;
}
