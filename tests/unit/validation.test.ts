/**
 * Validation agent. All document text here is SYNTHETIC test data written for
 * these tests; it is not taken from any institution.
 */
import { describe, expect, it } from "vitest";
import { checkRole, explainConflict, isCheckable } from "@/lib/agents/validation";
import type { ChatConfig } from "@/lib/ai/provider";
import type { StoredCandidate } from "@/lib/fields/resolve";
import { KDK_MECH_V1 as DEF } from "@/lib/templates/kdk-mech-v1";

const field = (key: string) => DEF.fields.find((f) => f.key === key)!;
const cand = (value: string, sourceKind: StoredCandidate["sourceKind"], page = 1): StoredCandidate => ({
  id: `${sourceKind}-${value}`,
  fieldKey: "activity_date",
  value,
  normalized: value,
  sourceId: `src-${sourceKind}`,
  sourceKind,
  page,
  confidence: 0.9,
  method: "deterministic_parser",
});
const fakeChat = (answer: unknown): ChatConfig => ({
  baseUrl: "http://llm.invalid/v1",
  model: "test-model",
  fetchImpl: (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))) as unknown as typeof fetch,
});
const SNIPPET = "Ref: SCI/2031/07  Date: 02/01/2031  The quiz will be held on 12/01/2031 in Hall B.";

describe("validation agent: conflict explanation", () => {
  it("lists which documents state which value, most-supported first", () => {
    const e = explainConflict(field("activity_date"), [cand("2031-01-12", "notice"), cand("2031-01-12", "activity_report"), cand("2031-01-10", "poster")]);
    expect(e!.groups.map((g) => [g.value, g.sources.length])).toEqual([["2031-01-12", 2], ["2031-01-10", 1]]);
    expect(e!.message).toBe("Date of Activity: 2031-01-12 (Notice p.1, Existing activity report p.1) vs 2031-01-10 (Poster p.1). Choose the correct value.");
  });
  it("says nothing when the documents agree", () => {
    expect(explainConflict(field("activity_date"), [cand("2031-01-12", "notice"), cand("2031-01-12", "poster")])).toBeNull();
  });
});

describe("validation agent: role check", () => {
  it("keeps a verdict whose evidence is in the text", async () => {
    const r = await checkRole(field("notice_date"), { value: "2031-01-12", sourceKind: "notice", snippet: SNIPPET },
      fakeChat({ verdict: "different_field", evidence: "will be held on 12/01/2031", reason: "this is the event date" }));
    expect(r).toMatchObject({ verdict: "different_field", evidence: "will be held on 12/01/2031" });
  });
  it("turns a verdict with made-up evidence, or no clear verdict, into 'unclear'", async () => {
    const f = field("notice_date");
    const c = { value: "2031-01-02", sourceKind: "notice" as const, snippet: SNIPPET };
    expect((await checkRole(f, c, fakeChat({ verdict: "states_field", evidence: "Issued on 2 January" }))).verdict).toBe("unclear");
    expect((await checkRole(f, c, fakeChat({ verdict: "maybe", evidence: "Date: 02/01/2031" }))).verdict).toBe("unclear");
  });
  it("applies only to dates, times and numbers", () => {
    expect(isCheckable(field("activity_date"))).toBe(true);
    expect(isCheckable(field("total_count"))).toBe(true);
    expect(isCheckable(field("venue"))).toBe(false);
  });
});
