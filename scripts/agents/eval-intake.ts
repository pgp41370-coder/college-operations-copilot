/**
 * LOCAL ONLY. Scores the Intake agent against the page kinds a person read
 * from the two KDK reference packets (scripts/lib/reference-packets.ts).
 *
 *   npx tsx scripts/agents/eval-intake.ts                    # rules only
 *   AI_PROVIDER=openai_compatible AI_BASE_URL=http://localhost:11434/v1 \
 *     AI_MODEL=qwen2.5:7b npx tsx scripts/agents/eval-intake.ts   # rules + local model
 *
 * Prints page numbers and document kinds only — never page text, which
 * contains student names. Results are also written (kinds only) to
 * .cache/agents/intake-eval.json.
 *
 * Caveat printed with the result: the rules were written while looking at
 * these same pages, so their score here is in-sample, not a fair test.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chatConfig } from "../../src/lib/ai/provider";
import { missingKinds, runIntake } from "../../src/lib/agents/intake";
import { KDK_MECH_V1 } from "../../src/lib/templates/kdk-mech-v1";
import { allPackets, PACKETS, packetPages, referenceAvailable } from "../lib/reference-packets";

async function main() {
  if (!referenceAvailable()) {
    console.log("Reference packets or local OCR tools not available — nothing to evaluate.");
    return;
  }
  const cfg = chatConfig();
  console.log(`Model: ${cfg ? `${cfg.model} @ ${cfg.baseUrl}` : "none (rules only)"}\n`);
  const rows: { packet: string; heldOut: boolean; page: number; truth: string; rules: string; llm: string | null; final: string; needsReview: boolean; ms: number }[] = [];
  for (const packet of allPackets()) {
    for (const page of packetPages(packet)) {
      const t0 = Date.now();
      const r = await runIntake(page, cfg);
      const llm = r.llm == null ? null : "rejected" in r.llm ? `rejected: ${r.llm.rejected}` : r.llm.kind;
      rows.push({ packet: packet.id, heldOut: !!packet.heldOut, page: page.page, truth: page.kind, rules: r.rules.kind, llm, final: r.suggestion.kind, needsReview: r.needsReview, ms: Date.now() - t0 });
      const mark = (k: string | null) => (k === page.kind ? "✓" : "✗");
      console.log(
        `${packet.id.padEnd(6)} p${String(page.page).padEnd(3)} truth ${page.kind.padEnd(16)} rules ${r.rules.kind.padEnd(16)}${mark(r.rules.kind)}` +
          (cfg ? `  llm ${String(llm).padEnd(16)}${mark(llm)}  final ${r.suggestion.kind.padEnd(16)}${mark(r.suggestion.kind)}${r.needsReview ? "  REVIEW" : ""}` : ""),
      );
    }
  }
  const n = rows.length;
  const pct = (k: number) => `${k}/${n} (${Math.round((100 * k) / n)}%)`;
  console.log(`\nPages scored: ${n}`);
  console.log(`Rules accuracy: ${pct(rows.filter((r) => r.rules === r.truth).length)}   (in-sample: rules were written using these pages)`);
  if (cfg) {
    const answered = rows.filter((r) => r.llm && !r.llm.startsWith("rejected"));
    console.log(`LLM accuracy:   ${pct(rows.filter((r) => r.llm === r.truth).length)}   grounded answers ${answered.length}/${n}`);
    console.log(`Final accuracy: ${pct(rows.filter((r) => r.final === r.truth).length)}`);
    const flagged = rows.filter((r) => r.needsReview);
    const wrongUnflagged = rows.filter((r) => r.final !== r.truth && !r.needsReview).length;
    console.log(`Flagged for review: ${flagged.length}/${n}; wrong and NOT flagged: ${wrongUnflagged}`);
    console.log(`Median time per page: ${rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(n / 2)]} ms`);
  }

  const held = rows.filter((r) => r.heldOut);
  if (held.length) {
    const h = (k: number) => `${k}/${held.length} (${Math.round((100 * k) / held.length)}%)`;
    console.log(`\nHELD-OUT pages (never used to write rules or prompts): ${held.length}`);
    console.log(`  rules ${h(held.filter((r) => r.rules === r.truth).length)}` + (cfg ? `   llm ${h(held.filter((r) => r.llm === r.truth).length)}   final ${h(held.filter((r) => r.final === r.truth).length)}   wrong & not flagged ${held.filter((r) => r.final !== r.truth && !r.needsReview).length}` : ""));
  } else console.log("\nNo held-out packets yet (reference-data/held-out.json) — every score above is in-sample.");

  // Missing-document check: each packet is complete; removing a kind must be reported.
  for (const packet of PACKETS) {
    const kinds = Object.values(packet.pages).filter(Boolean) as string[];
    const complete = missingKinds(KDK_MECH_V1, kinds);
    const withoutNotice = missingKinds(KDK_MECH_V1, kinds.filter((k) => k !== "notice"));
    console.log(`Missing check ${packet.id}: complete packet -> [${complete.join(", ")}]; without notice -> [${withoutNotice.join(", ")}]`);
  }

  const dir = path.join(process.cwd(), ".cache", "agents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "intake-eval.json"), JSON.stringify({ model: cfg?.model ?? null, at: new Date().toISOString(), rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
