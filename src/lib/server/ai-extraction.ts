import type { AIProvider } from "../ai/provider";
import type { FieldCandidate, PageText } from "../extraction/types";
import type { SourceKind } from "../templates/schema";
import { getActivity, insertCandidates, loadTemplate, recomputeFields, refreshStatus } from "./activities";
import type { User } from "./auth-core";
import { audit } from "./audit";
import { AppError } from "./errors";
import type { Sql } from "./types";

/**
 * Optional LLM-assisted extraction. Adds grounded "llm" candidates alongside
 * the deterministic ones; conflicts between them surface like any other.
 */
export async function runLlmExtraction(sql: Sql, user: User, activityId: string, provider: AIProvider) {
  if (provider.mode !== "llm") throw new AppError(409, "No language model is configured. Deterministic extraction is used.");
  const a = await getActivity(sql, user, activityId);
  if (a.status === "APPROVED" || a.status === "ARCHIVED") throw new AppError(409, "This activity can no longer be edited.");
  const { def } = await loadTemplate(sql, a.template_id);
  const rows = await sql<{ source_id: string; kind: SourceKind; filename: string; page: number; text: string; method: "pdf_text" | "ocr" | "none"; confidence: string | null }[]>`
    select e.source_id, s.kind, s.filename, e.page, e.text, e.method, e.confidence
    from source_extractions e join sources s on s.id = e.source_id where s.activity_id = ${activityId} and s.kind <> 'photo'`;
  if (!rows.length) throw new AppError(409, "Extract text from at least one document first.");
  const bySource = new Map<string, PageText[]>();
  for (const r of rows) {
    const list = bySource.get(r.source_id) ?? [];
    list.push({ sourceId: r.source_id, kind: r.kind, filename: r.filename, page: r.page, text: r.text, method: r.method, confidence: r.confidence == null ? null : Number(r.confidence) });
    bySource.set(r.source_id, list);
  }
  let accepted = 0;
  let rejected = 0;
  const all: FieldCandidate[] = [];
  for (const pages of bySource.values()) {
    const res = await provider.extractFields(pages, def);
    accepted += res.candidates.length;
    rejected += res.rejected.length;
    all.push(...res.candidates);
  }
  await sql.begin(async (tx) => {
    await tx`delete from field_candidates where activity_id = ${activityId} and method = 'llm'`;
    await insertCandidates(tx, activityId, all);
    await recomputeFields(tx, activityId, def);
    await audit(tx, { actorId: user.id, action: "ai.extraction", activityId, entityType: "activity", entityId: activityId, details: { provider: provider.label, accepted, rejected } });
    await tx`update activities set fields_updated_at = clock_timestamp(), updated_at = now() where id = ${activityId}`;
    await refreshStatus(tx, activityId);
  });
  return { accepted, rejected };
}
