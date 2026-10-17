/**
 * LOCAL ONLY. Runs the Drafting agent on the KDK reference packets: the field
 * values come from the rule-based extraction, then each narrative field is
 * drafted as if it were empty.
 *
 *   AI_PROVIDER=openai_compatible AI_BASE_URL=http://127.0.0.1:11434/v1 \
 *     AI_MODEL=qwen2.5:7b npx tsx scripts/agents/eval-drafting.ts
 *
 * Prints counts and drop reasons only. The drafts (which can repeat names from
 * the documents) are written to .cache/agents/drafts.json for a person to read
 * and judge: is every sentence true to the documents?
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chatConfig } from "../../src/lib/ai/provider";
import { draftNarrative } from "../../src/lib/agents/drafting";
import { extractCandidates } from "../../src/lib/extraction/parser";
import { resolveField } from "../../src/lib/fields/resolve";
import { KDK_MECH_V1 as DEF } from "../../src/lib/templates/kdk-mech-v1";
import { PACKETS, packetPages, referenceAvailable } from "../lib/reference-packets";

async function main() {
  if (!referenceAvailable()) return console.log("Reference packets or local OCR tools not available — nothing to evaluate.");
  const cfg = chatConfig();
  if (!cfg) return console.log("No model configured (set AI_PROVIDER, AI_BASE_URL, AI_MODEL).");
  const out: unknown[] = [];
  const t = { drafts: 0, refused: 0, kept: 0, dropped: 0, reasons: {} as Record<string, number>, ms: [] as number[] };
  for (const packet of PACKETS) {
    const pages = packetPages(packet);
    const kindOf = new Map(pages.map((p) => [p.sourceId, p.kind]));
    const cands = extractCandidates(pages, DEF).map((c, i) => ({ ...c, id: `c${i}`, sourceKind: kindOf.get(c.sourceId)! }));
    const values: Record<string, string> = {};
    const disputed: string[] = [];
    for (const f of DEF.fields) {
      const mine = cands.filter((c) => c.fieldKey === f.key);
      const r = resolveField(f, mine, undefined, DEF);
      if (r?.value && r.status !== "conflicting") values[f.key] = r.value;
      if (r?.status === "conflicting" && f.type === "date") disputed.push(...new Set(mine.map((c) => c.normalized)));
    }
    for (const f of DEF.fields.filter((x) => x.type === "longtext")) {
      const { [f.key]: _own, ...others } = values; // draft as if this field were empty
      const t0 = Date.now();
      const d = await draftNarrative(DEF, f, others, cfg, disputed);
      t.ms.push(Date.now() - t0);
      if ("rejected" in d) {
        t.refused++;
        t.dropped += d.dropped?.length ?? 0;
        for (const x of d.dropped ?? []) {
          const kind = x.reason.replace(/".*"|\d+|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, "…");
          t.reasons[kind] = (t.reasons[kind] ?? 0) + 1;
        }
        console.log(`${packet.id.padEnd(6)} ${f.key.padEnd(18)} refused: ${d.rejected}`);
        out.push({ packet: packet.id, field: f.key, rejected: d.rejected, dropped: d.dropped ?? [] });
        continue;
      }
      t.drafts++;
      t.kept += d.sentences.length;
      t.dropped += d.dropped.length;
      for (const x of d.dropped) {
        const kind = x.reason.replace(/".*"|\d+|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, "…");
        t.reasons[kind] = (t.reasons[kind] ?? 0) + 1;
      }
      console.log(`${packet.id.padEnd(6)} ${f.key.padEnd(18)} kept ${d.sentences.length}, removed ${d.dropped.length}  (${Date.now() - t0} ms)`);
      out.push({ packet: packet.id, field: f.key, draft: d.text, sentences: d.sentences, dropped: d.dropped, actual: _own ?? null });
    }
  }
  console.log(`\nDrafts: ${t.drafts} (refused ${t.refused}); sentences kept ${t.kept}, removed by the checker ${t.dropped}`);
  console.log("Removal reasons:", t.reasons);
  const ms = t.ms.sort((a, b) => a - b);
  console.log(`Median time per draft: ${ms[Math.floor(ms.length / 2)]} ms`);
  const dir = path.join(process.cwd(), ".cache", "agents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "drafts.json"), JSON.stringify({ model: cfg.model, at: new Date().toISOString(), drafts: out }, null, 2));
  console.log("Drafts for a person to judge: .cache/agents/drafts.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
