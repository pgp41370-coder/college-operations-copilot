/**
 * Unit tests for pure logic. All document text here is SYNTHETIC test data
 * written for these tests; it is not taken from any institution.
 */
import { describe, expect, it } from "vitest";
import { findDates, findTimes, formatTime, normalizeValue } from "@/lib/normalize";
import { extractCandidates, cleanValue, prefixMatch } from "@/lib/extraction/parser";
import { parseAttendanceRows, readGenderToken } from "@/lib/extraction/attendance";
import type { PageText } from "@/lib/extraction/types";
import { resolveField, type StoredCandidate } from "@/lib/fields/resolve";
import { reconcile } from "@/lib/reconciliation";
import { buildActivityReport, buildDetailedReport, NOT_PROVIDED } from "@/lib/reports/build";
import { assessReadiness } from "@/lib/readiness";
import { KDK_MECH_V1 as DEF } from "@/lib/templates/kdk-mech-v1";
import { validateTemplateDefinition } from "@/lib/templates/schema";

const page = (kind: PageText["kind"], text: string, over: Partial<PageText> = {}): PageText => ({
  sourceId: `src-${kind}`,
  kind,
  filename: `${kind}.pdf`,
  page: 1,
  text,
  method: "pdf_text",
  confidence: null,
  ...over,
});

describe("normalize", () => {
  it("reads Indian DD/MM/YYYY and written dates, including OCR superscript noise", () => {
    expect(findDates("Date:- 06/11/2024").map((d) => d.iso)).toEqual(["2024-11-06"]);
    expect(findDates('held on 6" November 2024.').map((d) => d.iso)).toEqual(["2024-11-06"]);
    expect(findDates("31ST OCTOBER, 2024").map((d) => d.iso)).toEqual(["2024-10-31"]);
    expect(findDates("on 6th November 2024").map((d) => d.iso)).toEqual(["2024-11-06"]);
  });
  it("rejects impossible dates instead of guessing", () => {
    expect(findDates("31/02/2024")).toEqual([]);
    expect(normalizeValue("date", "sometime in November").ok).toBe(false);
  });
  it("reads times and does not mistake dates for times", () => {
    expect(findTimes("at 01.30 pm").map((t) => t.hhmm)).toEqual(["13:30"]);
    expect(findTimes("06.11.2024")).toEqual([]);
    expect(formatTime("13:30")).toBe("01.30 pm");
  });
  it("validates integers", () => {
    expect(normalizeValue("integer", "007")).toEqual({ ok: true, value: "7" });
    expect(normalizeValue("integer", "45 approx").ok).toBe(false);
  });
});

const SYNTHETIC_REPORT = `Demo Institute of Technology
Activity Report
Session: 2030-31

Category of the Activity: | Technical
Title of the Activity “Robotics Workshop”
Coordinator A. Example, B. Sample
Date of Activity 12/01/2031 Time: 10.00 am
No. of Students Involved: | Male: 20 Female: 10 Total: 30
Association/Collaboration Demo Club
Details of Invited Speaker a
Brief about an Students built line-following robots
Activity in small teams.

Objectives To introduce basic robotics.
Outcomes Students assembled working robots.

Faculty Coordinator HoD/ Committee IQAC Coordinator Principal
Co-ordinator HOD HEAD IQAC Coordinator`;

describe("parser (synthetic structured report)", () => {
  const cands = extractCandidates([page("activity_report", SYNTHETIC_REPORT)], DEF);
  const get = (k: string) => cands.filter((c) => c.fieldKey === k).map((c) => c.value);

  it("extracts labelled fields with provenance", () => {
    expect(get("session")).toEqual(["2030-31"]);
    expect(get("category")).toEqual(["Technical"]);
    expect(get("title")).toEqual(['"Robotics Workshop"']);
    expect(get("coordinator")).toEqual(["A. Example, B. Sample"]);
    expect(get("activity_date")).toEqual(["2031-01-12"]);
    expect(get("activity_time")).toEqual(["10:00"]);
    expect(get("male_count")).toEqual(["20"]);
    expect(get("female_count")).toEqual(["10"]);
    expect(get("total_count")).toEqual(["30"]);
    const c = cands.find((x) => x.fieldKey === "category")!;
    expect(c.sourceId).toBe("src-activity_report");
    expect(c.page).toBe(1);
    expect(c.rule).toBe("label_value:same_line");
    expect(c.snippet).toContain("Category of the Activity");
  });
  it("joins wrapped labels and multi-line narrative", () => {
    expect(get("brief")).toEqual(["Students built line-following robots in small teams."]);
    expect(get("objectives")).toEqual(["To introduce basic robotics."]);
  });
  it("does not invent a speaker from OCR debris", () => {
    expect(get("invited_speaker")).toEqual([]);
  });
  it("stops at the signature table (no bogus coordinator)", () => {
    expect(get("coordinator")).toHaveLength(1);
  });
  it("skips photographs entirely", () => {
    expect(extractCandidates([page("photo", SYNTHETIC_REPORT)], DEF)).toEqual([]);
  });
  it("separates a notice's issue date from the activity date", () => {
    const notice = `Date:- 05/01/2031\n\nNOTICE\n\nAll students are informed that a “Robotics Workshop” will be held on 12th January 2031 at 10.00 am in Seminar Hall B-12.\n\nA. Example\nCo-ordinator`;
    const n = extractCandidates([page("notice", notice)], DEF);
    expect(n.find((c) => c.fieldKey === "notice_date")?.value).toBe("2031-01-05");
    expect(n.find((c) => c.fieldKey === "activity_date")?.value).toBe("2031-01-12");
    expect(n.find((c) => c.fieldKey === "activity_time")?.value).toBe("10:00");
    expect(n.find((c) => c.fieldKey === "venue")?.value).toMatch(/Seminar Hall B-12/);
  });
  it("caps confidence by OCR page confidence", () => {
    const low = extractCandidates([page("activity_report", SYNTHETIC_REPORT, { method: "ocr", confidence: 55 })], DEF);
    expect(Math.max(...low.map((c) => c.confidence))).toBeLessThanOrEqual(0.55);
  });
  it("tolerates small OCR slips in labels but marks them fuzzy with lower confidence", () => {
    const d = extractCandidates([page("detailed_report", "Date:- 12/01/2031\nREPORT\n\nTopie- Robotics Workshop\n\nThe workshop was held.\n\nImpact Analvsis:\nStudents learned.\n")], DEF);
    expect(d.find((c) => c.fieldKey === "title")?.value).toBe("Robotics Workshop");
    expect(d.find((c) => c.fieldKey === "event_description")?.value).toBe("The workshop was held.");
    expect(d.find((c) => c.fieldKey === "impact_analysis")?.value).toBe("Students learned.");
    const t = extractCandidates([page("activity_report", "Category of the Actvity: Technical\nOutcome of the day was good")], DEF);
    const cat = t.find((c) => c.fieldKey === "category")!;
    expect(cat.value).toBe("Technical");
    expect(cat.rule).toMatch(/fuzzy_label/);
    expect(cat.confidence).toBeLessThan(0.8);
    // Short labels are never matched approximately.
    expect(t.find((c) => c.fieldKey === "outcomes")).toBeUndefined();
  });
  it("prefixMatch is exact for short labels", () => {
    expect(prefixMatch("topie", "topic")).toEqual({ len: 5, fuzzy: true });
    expect(prefixMatch("topie", "topic", 10)).toBeNull();
    expect(prefixMatch("sessionx", "session")).toEqual({ len: 7, fuzzy: false });
  });
  it("cleanValue strips table debris", () => {
    expect(cleanValue(": | Social Responsibility |")).toBe("Social Responsibility");
  });
});

describe("attendance OCR rows", () => {
  it("reads gender only from the gender column text, never from names", () => {
    expect(readGenderToken("Male")).toEqual({ gender: "male", exact: true });
    expect(readGenderToken("Mele")).toEqual({ gender: "male", exact: false });
    expect(readGenderToken("Ferale")).toEqual({ gender: "female", exact: false });
    expect(readGenderToken("M.")).toBeNull();
    expect(readGenderToken("Priya")).toBeNull();
  });
  it("drafts rows that always require review", () => {
    const text = `Sr. No. Name of Student Gender Student Sign\n1 Asha Demo Female sig\n2 Ravi Sample Mele sig\n3 Kiran Test sig\n37\n`;
    const rows = parseAttendanceRows(page("attendance", text, { method: "ocr", confidence: 60 }));
    expect(rows.map((r) => [r.serialNo, r.gender])).toEqual([
      [1, "female"],
      [2, "male"],
      [3, "unspecified"],
    ]);
    expect(rows.every((r) => r.issues[0].startsWith("OCR draft"))).toBe(true);
    expect(rows[1].issues.join()).toMatch(/possible OCR error/);
    expect(rows[2].issues.join()).toMatch(/Gender not readable/);
  });
});

const cand = (over: Partial<StoredCandidate>): StoredCandidate => ({
  id: Math.random().toString(36).slice(2),
  fieldKey: "activity_date",
  value: "2024-11-06",
  normalized: "2024-11-06",
  sourceId: "s1",
  sourceKind: "activity_report",
  page: 1,
  confidence: 0.9,
  method: "deterministic_parser",
  ...over,
});
const field = (k: string) => DEF.fields.find((f) => f.key === k)!;

describe("field resolution / conflict detection", () => {
  it("flags disagreeing dates as a conflict with no value chosen", () => {
    const r = resolveField(field("activity_date"), [cand({}), cand({ value: "2024-11-05", normalized: "2024-11-05", sourceKind: "notice" })], undefined, DEF)!;
    expect(r.status).toBe("conflicting");
    expect(r.value).toBeNull();
  });
  it("agreeing candidates resolve to extracted", () => {
    const r = resolveField(field("activity_date"), [cand({}), cand({ sourceKind: "notice", confidence: 0.8 })], undefined, DEF)!;
    expect(r.status).toBe("extracted");
    expect(r.value).toBe("2024-11-06");
  });
  it("marks fields with no candidates as missing", () => {
    expect(resolveField(field("objectives"), [], undefined, DEF)!.status).toBe("missing");
  });
  it("never overwrites a user decision", () => {
    expect(resolveField(field("activity_date"), [cand({})], { value: "2024-11-07", status: "user_entered", editedBy: "u1" }, DEF)).toBeNull();
  });
  it("ranks text candidates by confidence band, then source priority", () => {
    const t = (value: string, sourceKind: StoredCandidate["sourceKind"], confidence: number) =>
      cand({ fieldKey: "title", value, normalized: value.toLowerCase(), sourceKind, confidence });
    const r = resolveField(field("title"), [t("Wrapped junk", "activity_report", 0.5), t("Clean topic", "detailed_report", 0.85), t("Poster", "poster", 0.5)], undefined, DEF)!;
    expect(r.value).toBe("Clean topic");
    expect(r.distinctValues).toBe(3);
  });
});

describe("reconciliation", () => {
  const rows = (m: number, f: number, u = 0, verified = true) => [
    ...Array(m).fill({ gender: "male", verified }),
    ...Array(f).fill({ gender: "female", verified }),
    ...Array(u).fill({ gender: "unspecified", verified }),
  ];
  it("passes when stated counts add up and match verified attendance", () => {
    const r = reconcile({ male: "38", female: "7", total: "45" }, rows(38, 7));
    expect(r.overall).toBe("PASS");
  });
  it("detects a stated arithmetic error", () => {
    const r = reconcile({ male: "38", female: "7", total: "46" }, []);
    expect(r.overall).toBe("FAIL");
    expect(r.messages.join()).toMatch(/do not reconcile/);
  });
  it("detects attendance vs stated total mismatch", () => {
    const r = reconcile({ male: "38", female: "7", total: "45" }, rows(30, 7));
    expect(r.overall).toBe("FAIL");
    expect(r.messages.join()).toMatch(/Participant-count mismatch detected/);
  });
  it("does not claim a gender check when genders are unreadable", () => {
    const r = reconcile({ male: "3", female: "1", total: "5" }, rows(3, 1, 1));
    expect(r.checks.find((c) => c.id === "attendance_male")!.result).toBe("INSUFFICIENT_DATA");
  });
  it("reports UNVERIFIED rather than PASS for unverified OCR rows", () => {
    expect(reconcile({ male: "1", female: "1", total: "2" }, rows(1, 1, 0, false)).overall).toBe("UNVERIFIED");
  });
  it("handles a missing participant count", () => {
    const r = reconcile({ male: null, female: null, total: null }, rows(2, 0));
    expect(r.overall).toBe("INSUFFICIENT_DATA");
  });
});

describe("report building", () => {
  it("renders 'Not provided' for missing data and never fills gaps", () => {
    const rep = buildActivityReport(DEF, { title: { value: "Workshop", status: "user_entered" } });
    const objectives = rep.narrativeRows.find((r) => r.label === "Objectives")!;
    expect(objectives.text).toBe(NOT_PROVIDED);
    expect(rep.missing).toContain("objectives");
    expect(rep.signatories[1].lines[0]).toMatch(/^_+$/);
  });
  it("renders conflicting values as not provided", () => {
    const rep = buildActivityReport(DEF, { activity_date: { value: null, status: "conflicting" } });
    expect(rep.detailRows.find((r) => r.label === "Date of Activity")!.text).toMatch(/^Not provided/);
  });
  it("drafts the detailed report only from existing fields", () => {
    const d = buildDetailedReport(DEF, {
      title: { value: "Workshop", status: "user_entered" },
      activity_date: { value: "2031-01-12", status: "user_entered" },
      objectives: { value: "Learn robotics.", status: "user_entered" },
    });
    expect(d.descriptionOrigin.kind).toBe("draft");
    expect(d.description).toContain("12/01/2031");
    expect(d.description).toContain("[Venue not provided]");
    expect(d.description).toContain("Learn robotics.");
    expect(d.impact).toBe(`${NOT_PROVIDED}.`);
  });
  it("uses the entered impact analysis verbatim when present", () => {
    const d = buildDetailedReport(DEF, { impact_analysis: { value: "Measured impact.", status: "user_entered" } });
    expect(d.impact).toBe("Measured impact.");
  });
});

describe("readiness gate", () => {
  const base = {
    def: DEF,
    reconciliation: reconcile({}, []),
    reconciliationAcknowledged: false,
    sources: [],
    reportsGeneratedAt: new Date(2030, 1, 2),
    fieldsUpdatedAt: new Date(2030, 1, 1),
  };
  it("blocks on missing required fields, conflicts and low confidence", () => {
    const r = assessReadiness({
      ...base,
      fields: {
        activity_date: { value: null, status: "conflicting", confidence: null, editedBy: null },
        title: { value: "x", status: "extracted", confidence: 0.5, editedBy: null },
      },
    });
    const codes = r.blocking.map((b) => b.code);
    expect(codes).toContain("conflict");
    expect(codes).toContain("low_confidence");
    expect(codes).toContain("required_missing");
  });
  it("blocks on stale reports", () => {
    const r = assessReadiness({ ...base, fields: {}, reportsGeneratedAt: new Date(2030, 1, 1), fieldsUpdatedAt: new Date(2030, 1, 2) });
    expect(r.blocking.map((b) => b.code)).toContain("reports_stale");
  });
});

describe("template validation", () => {
  it("accepts the pilot template", () => {
    expect(validateTemplateDefinition(DEF).ok).toBe(true);
  });
  it("rejects templates that reference unknown fields", () => {
    const bad = structuredClone(DEF);
    bad.activityReport.detailRows.push({ label: "X", value: "{nonexistent}" });
    const r = validateTemplateDefinition(bad);
    expect(r.ok).toBe(false);
  });
});

describe("geometric line rebuilding", () => {
  it("orders words into lines and keeps paragraph gaps without changing words", async () => {
    const { wordsToText } = await import("@/lib/extraction/layout");
    const w = (text: string, x: number, y: number) => ({ text, x0: x, x1: x + 40, y0: y, y1: y + 10, confidence: 90 });
    // Value column emitted before the label column, as Tesseract sometimes does.
    const text = wordsToText([w("Technical", 200, 100), w("Category:", 10, 101), w("Next", 10, 160), w("para", 60, 160)]);
    expect(text).toBe("Category: Technical\n\nNext para");
  });
});

describe("LLM grounding (optional adapter)", () => {
  it("accepts only values backed by a verbatim quote on the cited page", async () => {
    const { groundLlmValue, OpenAICompatibleProvider, LLM_MAX_CONFIDENCE } = await import("@/lib/ai/provider");
    const pages = [page("notice", "The workshop will be held on 12th January 2031 in Hall B.")];
    const ok = groundLlmValue({ field: "activity_date", value: "12/01/2031", quote: "held on 12th January 2031", page: 1 }, pages, DEF);
    expect(ok.ok && ok.candidate.method === "llm" && ok.candidate.confidence === LLM_MAX_CONFIDENCE).toBe(true);
    expect(groundLlmValue({ field: "activity_date", value: "13/01/2031", quote: "held on 12th January 2031", page: 1 }, pages, DEF).ok).toBe(false);
    expect(groundLlmValue({ field: "total_count", value: "45", quote: "45 students attended", page: 1 }, pages, DEF).ok).toBe(false);
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [
        { field: "venue", value: "Hall B", quote: "in Hall B", page: 1 },
        { field: "total_count", value: "45", quote: "45 students", page: 1 },
      ] }) } }] }))) as unknown as typeof fetch;
    const p = new OpenAICompatibleProvider("http://llm.invalid/v1", "test-model", undefined, fakeFetch);
    const r = await p.extractFields(pages, DEF);
    expect(r.candidates.map((c) => c.fieldKey)).toEqual(["venue"]);
    // a notice cannot state participant counts, so that answer is rejected before the quote check
    expect(r.rejected).toEqual([{ field: "total_count", reason: "field not expected in this kind of document" }]);
  });
  it("defaults to the deterministic provider when nothing is configured", async () => {
    const { getProvider } = await import("@/lib/ai/provider");
    expect(getProvider().mode).toBe("deterministic");
  });
});
