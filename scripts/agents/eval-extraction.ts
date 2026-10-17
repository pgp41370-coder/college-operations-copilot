/**
 * LOCAL ONLY. Scores field extraction — rules, the LLM Extraction agent, and
 * both combined — against values a person read from the printed activity
 * reports of the two KDK reference packets.
 *
 *   AI_PROVIDER=openai_compatible AI_BASE_URL=http://127.0.0.1:11434/v1 \
 *     AI_MODEL=qwen2.5:7b npx tsx scripts/agents/eval-extraction.ts
 *
 * Prints field keys and correct/wrong marks only — never extracted values or
 * page text (they can contain names). Kinds-only results go to
 * .cache/agents/extraction-eval.json.
 *
 * The answer key is the one asserted in tests/reference/kdk-cases.test.ts.
 * The activity date is printed as 06/11/2024 in the reports but the posters
 * say 31/10/2024: the correct behaviour is to flag that conflict, or to give
 * the report date — never to state the poster date alone.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chatConfig, OpenAICompatibleProvider } from "../../src/lib/ai/provider";
import { extractCandidates } from "../../src/lib/extraction/parser";
import type { FieldCandidate, PageText } from "../../src/lib/extraction/types";
import { resolveField, type StoredCandidate } from "../../src/lib/fields/resolve";
import { KDK_MECH_V1 as DEF } from "../../src/lib/templates/kdk-mech-v1";
import { PACKETS, packetPages, referenceAvailable } from "../lib/reference-packets";

type Expect = { equals: string } | { includes: string } | { missing: true } | { date: string; conflictWith: string };
const COMMON: Record<string, Expect> = {
  session: { equals: "2024-25" },
  category: { equals: "Social Resposibility" }, // spelled as printed
  association: { equals: "Institution Innovation Council" },
  activity_time: { equals: "13:30" },
  activity_date: { date: "2024-11-06", conflictWith: "2024-10-31" },
  invited_speaker: { missing: true }, // the reports print only dashes
};
const KEY: Record<string, Record<string, Expect>> = {
  essay: { ...COMMON, title: { includes: "Essay Writing" }, male_count: { equals: "39" }, female_count: { equals: "7" }, total_count: { equals: "46" }, notice_date: { equals: "2024-10-28" } },
  oath: { ...COMMON, title: { includes: "Oath" }, male_count: { equals: "38" }, female_count: { equals: "7" }, total_count: { equals: "45" }, notice_date: { equals: "2024-11-05" } },
};

type Verdict = "ok" | "flagged" | "missed" | "wrong" | "invented";

function judge(exp: Expect, status: string, value: string | null, values: Set<string>): Verdict {
  if ("missing" in exp) return value == null && status !== "conflicting" ? "ok" : "invented";
  if ("date" in exp) {
    if (status === "conflicting") return values.has(exp.date) ? "flagged" : "wrong";
    if (value == null) return "missed";
    return value === exp.date ? "ok" : "wrong";
  }
  if (status === "conflicting") return "flagged";
  if (value == null) return "missed";
  const good = "equals" in exp ? value === exp.equals : value.includes(exp.includes);
  return good ? "ok" : "wrong";
}

function stored(c: FieldCandidate, kind: StoredCandidate["sourceKind"], i: number): StoredCandidate {
  return { id: `c${i}`, fieldKey: c.fieldKey, value: c.value, normalized: c.normalized, sourceId: c.sourceId, sourceKind: kind, page: c.page, confidence: c.confidence, method: c.method };
}

async function main() {
  if (!referenceAvailable()) return console.log("Reference packets or local OCR tools not available — nothing to evaluate.");
  const cfg = chatConfig();
  if (!cfg) return console.log("No model configured (set AI_PROVIDER, AI_BASE_URL, AI_MODEL).");
  const llm = new OpenAICompatibleProvider(cfg.baseUrl, cfg.model, cfg.apiKey);
  console.log(`Model: ${cfg.model}\n`);
  const tally: Record<string, Record<Verdict, number>> = {};
  const out: unknown[] = [];
  const llmStats = { accepted: 0, rejected: 0, wrongAccepted: 0, ms: [] as number[] };

  for (const packet of PACKETS) {
    const pages = packetPages(packet);
    const kindOf = new Map(pages.map((p) => [p.sourceId, p.kind]));
    const bySource = new Map<string, PageText[]>();
    for (const p of pages) if (p.kind !== "photo") bySource.set(p.sourceId, [...(bySource.get(p.sourceId) ?? []), p]);

    const rules = extractCandidates(pages, DEF);
    const model: FieldCandidate[] = [];
    for (const docPages of bySource.values()) {
      const t0 = Date.now();
      const r = await llm.extractFields(docPages, DEF);
      llmStats.ms.push(Date.now() - t0);
      llmStats.accepted += r.candidates.length;
      llmStats.rejected += r.rejected.length;
      model.push(...r.candidates);
    }
    const sets = { rules, llm: model, combined: [...rules, ...model] };
    const key = KEY[packet.id];
    for (const [field, exp] of Object.entries(key)) {
      // grounded-but-wrong model values (the guardrail let them through)
      if (!("missing" in exp)) {
        for (const c of model.filter((m) => m.fieldKey === field)) {
          const bad = "equals" in exp ? c.value !== exp.equals : "includes" in exp ? !c.value.includes(exp.includes) : c.value !== exp.date && c.value !== exp.conflictWith;
          if (bad) llmStats.wrongAccepted++;
        }
      } else llmStats.wrongAccepted += model.filter((m) => m.fieldKey === field).length;

      const def = DEF.fields.find((f) => f.key === field)!;
      const row: Record<string, string> = { packet: packet.id, field };
      for (const [name, cands] of Object.entries(sets)) {
        const mine = cands.filter((c) => c.fieldKey === field).map((c, i) => stored(c, kindOf.get(c.sourceId)!, i));
        const r = resolveField(def, mine, undefined, DEF)!;
        const v = judge(exp, r.status, r.value, new Set(mine.map((m) => m.normalized)));
        row[name] = v;
        tally[name] ??= { ok: 0, flagged: 0, missed: 0, wrong: 0, invented: 0 };
        tally[name][v]++;
      }
      out.push(row);
      console.log(`${packet.id.padEnd(6)} ${field.padEnd(16)} rules ${row.rules.padEnd(9)} llm ${row.llm.padEnd(9)} combined ${row.combined}`);
    }
  }
  const n = Object.values(KEY).reduce((s, k) => s + Object.keys(k).length, 0);
  console.log(`\nFields scored: ${n}   (ok = correct value; flagged = conflict correctly sent to a person)`);
  for (const [name, t] of Object.entries(tally)) {
    console.log(`${name.padEnd(9)} correct ${t.ok + t.flagged}/${n}  (ok ${t.ok}, flagged ${t.flagged})  missed ${t.missed}  wrong ${t.wrong}  invented ${t.invented}`);
  }
  const ms = llmStats.ms.sort((a, b) => a - b);
  console.log(`LLM values: accepted ${llmStats.accepted}, rejected by the quote check ${llmStats.rejected}; accepted but wrong on scored fields ${llmStats.wrongAccepted}`);
  console.log(`Median time per document: ${ms[Math.floor(ms.length / 2)]} ms (${ms.length} documents)`);
  const dir = path.join(process.cwd(), ".cache", "agents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "extraction-eval.json"), JSON.stringify({ model: cfg.model, at: new Date().toISOString(), tally, llmStats, rows: out }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
