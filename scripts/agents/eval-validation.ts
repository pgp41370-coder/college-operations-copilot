/**
 * LOCAL ONLY. Scores the Validation agent's role check on the KDK reference
 * packets: for every date/time/number candidate (rules + model) of a field in
 * the answer key, does the agent warn exactly on the values that belong to a
 * different field?
 *
 *   AI_PROVIDER=openai_compatible AI_BASE_URL=http://127.0.0.1:11434/v1 \
 *     AI_MODEL=qwen2.5:7b npx tsx scripts/agents/eval-validation.ts
 *
 * Second part (planted errors): each real candidate is re-filed under a
 * different field of the same type (e.g. the male count offered as the total
 * count, the activity date offered as the notice issue date). The quote is
 * real; only the field is wrong — exactly what the quote check cannot catch.
 *
 * Model extraction candidates are cached in .cache/agents/ (git-ignored) so
 * the slow extraction step runs once. Prints field keys, document kinds,
 * dates and counts only — no names or page text.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chatConfig, OpenAICompatibleProvider } from "../../src/lib/ai/provider";
import { checkRole, explainConflict, isCheckable } from "../../src/lib/agents/validation";
import { extractCandidates } from "../../src/lib/extraction/parser";
import type { FieldCandidate, PageText } from "../../src/lib/extraction/types";
import type { StoredCandidate } from "../../src/lib/fields/resolve";
import { KDK_MECH_V1 as DEF } from "../../src/lib/templates/kdk-mech-v1";
import { PACKETS, packetPages, referenceAvailable } from "../lib/reference-packets";

// Correct values per field (tests/reference/kdk-cases.test.ts). Both activity dates are genuine
// statements of the activity date (posters 31/10, reports 06/11): a real conflict, not a wrong field.
const KEY: Record<string, Record<string, string[]>> = {
  essay: { activity_date: ["2024-11-06", "2024-10-31"], activity_time: ["13:30"], male_count: ["39"], female_count: ["7"], total_count: ["46"], notice_date: ["2024-10-28"] },
  oath: { activity_date: ["2024-11-06", "2024-10-31"], activity_time: ["13:30"], male_count: ["38"], female_count: ["7"], total_count: ["45"], notice_date: ["2024-11-05"] },
};

type Cand = FieldCandidate & { sourceKind: StoredCandidate["sourceKind"] };

async function main() {
  if (!referenceAvailable()) return console.log("Reference packets or local OCR tools not available — nothing to evaluate.");
  const cfg = chatConfig();
  if (!cfg) return console.log("No model configured (set AI_PROVIDER, AI_BASE_URL, AI_MODEL).");
  const dir = path.join(process.cwd(), ".cache", "agents");
  mkdirSync(dir, { recursive: true });
  const cacheFile = path.join(dir, `candidates-${cfg.model.replace(/[^a-z0-9.]+/gi, "_")}.json`);
  const cache: Record<string, Cand[]> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
  const llm = new OpenAICompatibleProvider(cfg.baseUrl, cfg.model, cfg.apiKey);

  const t = { wrong: 0, caught: 0, wrongUnclear: 0, right: 0, falseAlarm: 0, rightUnclear: 0 };
  const rows: unknown[] = [];
  for (const packet of PACKETS) {
    const pages = packetPages(packet);
    const kindOf = new Map(pages.map((p) => [p.sourceId, p.kind]));
    if (!cache[packet.id]) {
      const bySource = new Map<string, PageText[]>();
      for (const p of pages) if (p.kind !== "photo") bySource.set(p.sourceId, [...(bySource.get(p.sourceId) ?? []), p]);
      const model: Cand[] = [];
      for (const doc of bySource.values()) for (const c of (await llm.extractFields(doc, DEF)).candidates) model.push({ ...c, sourceKind: kindOf.get(c.sourceId)! });
      cache[packet.id] = model.filter((c) => KEY[packet.id][c.fieldKey]);
      writeFileSync(cacheFile, JSON.stringify(cache));
    }
    const rules: Cand[] = extractCandidates(pages, DEF).map((c) => ({ ...c, sourceKind: kindOf.get(c.sourceId)! }));
    const all = [...rules.filter((c) => KEY[packet.id][c.fieldKey]), ...cache[packet.id]];

    for (const fieldKey of Object.keys(KEY[packet.id])) {
      const field = DEF.fields.find((f) => f.key === fieldKey)!;
      if (!isCheckable(field)) continue;
      const cands = all.filter((c) => c.fieldKey === fieldKey);
      const conflict = explainConflict(field, cands.map((c, i) => ({ ...c, id: `c${i}` })));
      if (conflict) console.log(`${packet.id.padEnd(6)} CONFLICT ${conflict.message}`);
      for (const c of cands) {
        const correct = KEY[packet.id][fieldKey].includes(c.value);
        const r = await checkRole(field, c, cfg);
        if (correct) {
          t.right++;
          if (r.verdict === "different_field") t.falseAlarm++;
          if (r.verdict === "unclear") t.rightUnclear++;
        } else {
          t.wrong++;
          if (r.verdict === "different_field") t.caught++;
          if (r.verdict === "unclear") t.wrongUnclear++;
        }
        rows.push({ packet: packet.id, field: fieldKey, kind: c.sourceKind, page: c.page, method: c.method, correct, verdict: r.verdict });
        console.log(`${packet.id.padEnd(6)} ${fieldKey.padEnd(13)} ${c.method === "llm" ? "llm  " : "rules"} ${c.sourceKind.padEnd(16)} p${c.page}  ${correct ? "correct" : "WRONG  "}  agent: ${r.verdict}`);
      }
    }
  }
  // Planted errors: real quote, wrong field.
  const SWAP: Record<string, string> = { activity_date: "notice_date", notice_date: "activity_date", male_count: "total_count", female_count: "male_count", total_count: "female_count" };
  const p = { planted: 0, caught: 0, unclear: 0 };
  for (const packet of PACKETS) {
    const pages = packetPages(packet);
    const kindOf = new Map(pages.map((x) => [x.sourceId, x.kind]));
    const rules: Cand[] = extractCandidates(pages, DEF).map((c) => ({ ...c, sourceKind: kindOf.get(c.sourceId)! }));
    const seen = new Set<string>();
    for (const c of [...rules, ...cache[packet.id]]) {
      const target = SWAP[c.fieldKey];
      if (!target || !KEY[packet.id][c.fieldKey]?.includes(c.value) || KEY[packet.id][target].includes(c.value)) continue;
      const id = `${target}|${c.value}|${c.sourceKind}|${c.page}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const r = await checkRole(DEF.fields.find((f) => f.key === target)!, c, cfg);
      p.planted++;
      if (r.verdict === "different_field") p.caught++;
      if (r.verdict === "unclear") p.unclear++;
      rows.push({ packet: packet.id, planted: true, from: c.fieldKey, as: target, kind: c.sourceKind, page: c.page, verdict: r.verdict });
      console.log(`${packet.id.padEnd(6)} PLANTED ${c.fieldKey} offered as ${target.padEnd(13)} ${c.sourceKind.padEnd(16)} p${c.page}  agent: ${r.verdict}`);
    }
  }
  console.log(`\nPlanted wrong-field values: ${p.planted}; agent warned on ${p.caught}, unclear ${p.unclear}, missed ${p.planted - p.caught - p.unclear}`);
  console.log(`\nWrong-field values: ${t.wrong}; agent warned on ${t.caught}, unclear ${t.wrongUnclear}, missed ${t.wrong - t.caught - t.wrongUnclear}`);
  console.log(`Correct values: ${t.right}; agent wrongly warned on ${t.falseAlarm}, unclear ${t.rightUnclear}`);
  writeFileSync(path.join(dir, "validation-eval.json"), JSON.stringify({ model: cfg.model, at: new Date().toISOString(), tally: t, planted: p, rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
