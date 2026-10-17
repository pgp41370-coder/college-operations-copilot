/**
 * Intake agent. All document text here is SYNTHETIC test data written for
 * these tests; it is not taken from any institution.
 */
import { describe, expect, it } from "vitest";
import { classifyByRules, classifyWithLlm, documentKind, missingKinds, missingMessage, runIntake } from "@/lib/agents/intake";
import type { ChatConfig } from "@/lib/ai/provider";
import type { PageText } from "@/lib/extraction/types";
import { KDK_MECH_V1 as DEF } from "@/lib/templates/kdk-mech-v1";

const page = (text: string): PageText => ({
  sourceId: "src-1",
  kind: "supporting",
  filename: "upload.pdf",
  page: 1,
  text,
  method: "ocr",
  confidence: 80,
});

const NOTICE = page("Ref No. XYZ/2031/14\nNOTICE\nAll the students are hereby informed that a quiz will be held on 12/01/2031 in Hall B.\nCoordinator");
const ATTENDANCE = page(
  ["Attendance - Science Quiz", "Sr No  Name  Gender  Sign", ...Array.from({ length: 8 }, (_, i) => `${i + 1}  Student ${String.fromCharCode(65 + i)}  M  ok`)].join("\n"),
);
const REPORT = page("ACTIVITY REPORT\nObjective: build quiz skills\nOutcome: students practised teamwork\nMale: 20 Female: 10 Total: 30\nCoordinator: A. Teacher");
const POSTER = page("Department of Science\npresents\nSCIENCE QUIZ 2031\n12 January 2031, Hall B\nAll are welcome");

const fakeChat = (answer: unknown): ChatConfig => ({
  baseUrl: "http://llm.invalid/v1",
  model: "test-model",
  fetchImpl: (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: typeof answer === "string" ? answer : JSON.stringify(answer) } }] }))) as unknown as typeof fetch,
});

describe("intake agent: rules", () => {
  it("recognises the common document kinds from layout and wording", () => {
    expect(classifyByRules(NOTICE).kind).toBe("notice");
    expect(classifyByRules(ATTENDANCE).kind).toBe("attendance");
    expect(classifyByRules(REPORT).kind).toBe("activity_report");
    expect(classifyByRules(POSTER).kind).toBe("poster");
    expect(classifyByRules(page("")).kind).toBe("photo");
  });
  it("quotes the line that triggered the rule", () => {
    expect(classifyByRules(NOTICE).quote).toBe("NOTICE");
    expect(classifyByRules(REPORT).quote).toBe("ACTIVITY REPORT");
  });
});

describe("intake agent: LLM answers are grounded or rejected", () => {
  it("keeps an answer whose quote is on the page", async () => {
    const r = await classifyWithLlm(NOTICE, fakeChat({ kind: "notice", quote: "students are hereby informed", reason: "notice wording" }));
    expect(r).toMatchObject({ kind: "notice", method: "llm" });
  });
  it("rejects a quote that is not on the page", async () => {
    const r = await classifyWithLlm(NOTICE, fakeChat({ kind: "notice", quote: "Circular issued by the Principal", reason: "" }));
    expect(r).toEqual({ rejected: "quote not found in page text" });
  });
  it("rejects kinds the product does not know and answers without a quote", async () => {
    expect(await classifyWithLlm(NOTICE, fakeChat({ kind: "invoice", quote: "NOTICE" }))).toEqual({ rejected: 'unknown kind "invoice"' });
    expect(await classifyWithLlm(NOTICE, fakeChat({ kind: "notice", quote: "" }))).toEqual({ rejected: "no supporting quote" });
  });
  it("accepts an empty quote only for a photo with no readable text", async () => {
    expect(await classifyWithLlm(page(""), fakeChat({ kind: "photo", quote: "" }))).toMatchObject({ kind: "photo", quote: null });
  });
  it("treats a malformed model reply as rejected, not as a crash", async () => {
    expect(await classifyWithLlm(NOTICE, fakeChat("not json"))).toEqual({ rejected: "LLM response was not valid JSON" });
  });
});

describe("intake agent: combined decision", () => {
  it("uses the rules alone when no model is configured", async () => {
    const r = await runIntake(NOTICE, null);
    expect(r.suggestion.method).toBe("rules");
    expect(r.needsReview).toBe(false);
  });
  it("flags disagreement between model and rules for a person to check", async () => {
    const r = await runIntake(NOTICE, fakeChat({ kind: "poster", quote: "quiz will be held", reason: "" }));
    expect(r.suggestion.kind).toBe("poster");
    expect(r.needsReview).toBe(true);
  });
  it("falls back to the rules, flagged, when the model answer is rejected", async () => {
    const r = await runIntake(NOTICE, fakeChat({ kind: "notice", quote: "made-up text" }));
    expect(r.suggestion).toMatchObject({ kind: "notice", method: "rules" });
    expect(r.needsReview).toBe(true);
  });
});

describe("intake agent: documents and missing kinds", () => {
  it("labels a multi-page document by its most frequent page kind", () => {
    const s = (kind: "attendance" | "supporting") => ({ kind, quote: null, reason: "", method: "rules" as const });
    expect(documentKind([s("attendance"), s("supporting"), s("attendance")])).toBe("attendance");
    expect(documentKind([])).toBeNull();
  });
  it("reports packet documents nobody uploaded, never the optional supporting kind", () => {
    expect(missingKinds(DEF, ["poster", "notice", "attendance", "photo"])).toEqual([]);
    expect(missingKinds(DEF, ["poster", "photo"])).toEqual(["notice", "attendance"]);
    expect(missingMessage(["notice", "attendance"])).toBe("Missing: Notice, Attendance sheet");
    expect(missingMessage([])).toBeNull();
  });
});
