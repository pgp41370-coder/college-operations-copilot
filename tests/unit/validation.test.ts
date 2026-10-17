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

describe("drafting agent", () => {
  const values = { title: "Science Quiz", activity_date: "2031-01-12", total_count: "30", venue: "Hall B" };
  it("keeps sentences whose numbers, months and names come from the cited fields", async () => {
    const { unsupported } = await import("@/lib/agents/drafting");
    expect(unsupported({ text: "The Science Quiz was held on 12 January 2031 in Hall B.", uses: ["title", "activity_date", "venue"] }, values, "brief")).toBeNull();
    expect(unsupported({ text: "In all, 30 students took part.", uses: ["total_count"] }, values, "brief")).toBeNull();
  });
  it("drops sentences with a detail that is not in the cited values", async () => {
    const { unsupported } = await import("@/lib/agents/drafting");
    expect(unsupported({ text: "In all, 45 students took part.", uses: ["total_count"] }, values, "brief")).toMatch(/number 45/);
    expect(unsupported({ text: "It was held in February.", uses: ["activity_date"] }, values, "brief")).toMatch(/month february/);
    expect(unsupported({ text: "The quiz was opened by Dr Mehta.", uses: ["title"] }, values, "brief")).toMatch(/is not in the provided values/);
    expect(unsupported({ text: "The quiz was useful.", uses: [] }, values, "brief")).toBe("cites no field");
    // a possessive of a provided name is not a new name
    expect(unsupported({ text: "The Science Quiz's 30 seats were filled.", uses: ["title", "total_count"] }, values, "brief")).toBeNull();
    expect(unsupported({ text: "The quiz was useful.", uses: ["outcomes"] }, values, "brief")).toMatch(/no value/);
  });
  it("never states a date the documents still disagree on", async () => {
    const { mentionsDate, unsupported } = await import("@/lib/agents/drafting");
    expect(mentionsDate("It was held on 12 January 2031.", "2031-01-12")).toBe(true);
    expect(mentionsDate("It was held on January 12th, 2031.", "2031-01-12")).toBe(true);
    expect(mentionsDate("It was held on 12/01/2031.", "2031-01-12")).toBe(true);
    expect(mentionsDate("It was held on 13 January 2031.", "2031-01-12")).toBe(false);
    const v = { ...values, report_date: "2031-01-12" };
    expect(unsupported({ text: "The quiz was held on 12 January 2031.", uses: ["report_date"] }, v, "brief", ["2031-01-12", "2031-01-10"])).toMatch(/disagree/);
  });
  it("returns only supported sentences, and says what was removed", async () => {
    const { draftNarrative } = await import("@/lib/agents/drafting");
    const r = await draftNarrative(DEF, field("brief"), values, fakeChat({ sentences: [
      { text: "The Science Quiz was held on 12 January 2031 in Hall B.", uses: ["title", "activity_date", "venue"] },
      { text: "It was attended by 45 students.", uses: ["total_count"] },
    ] }));
    expect(r).toMatchObject({ field: "brief", text: "The Science Quiz was held on 12 January 2031 in Hall B." });
    expect("sentences" in r && r.dropped.map((d) => d.reason)).toEqual(["number 45 is not in the cited values"]);
  });
  it("refuses to draft from too few details", async () => {
    const { draftNarrative } = await import("@/lib/agents/drafting");
    expect(await draftNarrative(DEF, field("brief"), { title: "Science Quiz" }, fakeChat({ sentences: [] }))).toEqual({ rejected: "not enough confirmed details to draft from" });
  });
});
