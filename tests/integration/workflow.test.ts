/**
 * End-to-end service workflow against a real Postgres database.
 * Documents are generated synthetic PDFs; their text is SYNTHETIC.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type postgres from "postgres";
import * as svc from "@/lib/server/activities";
import { makeUser, testSql } from "../helpers/db";

let sql: postgres.Sql;
let faculty: Awaited<ReturnType<typeof makeUser>>;

async function pdf(pages = 1, marker = Math.random().toString()) {
  const d = await PDFDocument.create();
  d.setTitle(marker);
  for (let i = 0; i < pages; i++) d.addPage();
  return d.save();
}

beforeAll(async () => {
  sql = testSql();
  faculty = await makeUser(sql, "faculty");
});
afterAll(async () => sql.end());

const REPORT_TEXT = `Activity Report
Session: 2030-31
Category of the Activity: | Technical
Title of the Activity “Robotics Workshop”
Coordinator A. Example
Date of Activity 12/01/2031 Time: 10.00 am
No. of Students Involved: | Male: 2 Female: 1 Total: 3
Brief about an Students built robots.
Activity
Objectives Introduce robotics.
Outcomes Robots assembled.
Faculty Coordinator`;

const NOTICE_TEXT = `Date:- 05/01/2031\n\nNOTICE\n\nStudents are informed that a “Robotics Workshop” will be held on 13th January 2031 at 10.00 am in Seminar Hall B-12.`;

describe("activity workflow", () => {
  let id: string;
  let reportSrc: string;
  let noticeSrc: string;

  it("creates an activity with user-entered fields and no invented values", async () => {
    id = await svc.createActivity(sql, faculty, { fields: { venue: "Seminar Hall B-12" } });
    const b = await svc.loadActivityBundle(sql, faculty, id);
    expect(b.activity.status).toBe("DRAFT");
    const venue = b.state.fields.find((f) => f.field_key === "venue")!;
    expect(venue.status).toBe("user_entered");
    expect(b.state.fields.find((f) => f.field_key === "objectives")!.status).toBe("missing");
    expect(b.state.fields.find((f) => f.field_key === "objectives")!.value).toBeNull();
  });

  it("rejects invalid values instead of guessing", async () => {
    await expect(svc.createActivity(sql, faculty, { fields: { activity_date: "next Tuesday" } })).rejects.toThrow(/Could not read a date/);
  });

  it("uploads documents and rejects duplicates, invalid types and corrupt files", async () => {
    const bytes = await pdf(1, "report");
    reportSrc = (await svc.addSource(sql, faculty, id, { kind: "activity_report", filename: "report.pdf", bytes })).id;
    noticeSrc = (await svc.addSource(sql, faculty, id, { kind: "notice", filename: "notice.pdf", bytes: await pdf(1, "notice") })).id;
    await expect(svc.addSource(sql, faculty, id, { kind: "notice", filename: "again.pdf", bytes })).rejects.toThrow(/already uploaded/);
    await expect(svc.addSource(sql, faculty, id, { kind: "notice", filename: "x.pdf", bytes: new TextEncoder().encode("nope") })).rejects.toThrow(/Unsupported/);
    await expect(svc.addSource(sql, faculty, id, { kind: "notice", filename: "x.pdf", bytes: new TextEncoder().encode("%PDF-1.4 garbage") })).rejects.toThrow(/could not be read/);
    await expect(svc.addSource(sql, faculty, id, { kind: "notice", filename: "x.pdf", bytes: new Uint8Array() })).rejects.toThrow(/empty/);
  });

  it("photos are stored as evidence and never processed", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const p = await svc.addSource(sql, faculty, id, { kind: "photo", filename: "event.jpg", bytes: jpeg, caption: "Opening session" });
    expect(p.extractionStatus).toBe("skipped");
    await expect(svc.saveExtraction(sql, faculty, p.id, { engine: "x", pages: [{ page: 1, method: "ocr", text: "12/12/2030", confidence: 90 }] })).rejects.toThrow(/not processed/);
  });

  it("stores extraction with provenance and detects the date conflict", async () => {
    await svc.saveExtraction(sql, faculty, reportSrc, { engine: "test", pages: [{ page: 1, method: "pdf_text", text: REPORT_TEXT, confidence: null }] });
    await svc.saveExtraction(sql, faculty, noticeSrc, { engine: "test", pages: [{ page: 1, method: "pdf_text", text: NOTICE_TEXT, confidence: null }] });
    const b = await svc.loadActivityBundle(sql, faculty, id);
    const f = (k: string) => b.state.fields.find((x) => x.field_key === k)!;
    expect(f("category")).toMatchObject({ value: "Technical", status: "extracted", source_id: reportSrc, source_page: 1 });
    expect(f("notice_date").value).toBe("2031-01-05");
    // Report says 12/01/2031, notice says 13th January 2031: conflict, no value chosen.
    expect(f("activity_date")).toMatchObject({ status: "conflicting", value: null });
    expect(b.state.blocking.map((x) => x.code)).toContain("conflict");
    // The user-entered venue survives extraction.
    expect(f("venue")).toMatchObject({ status: "user_entered", value: "Seminar Hall B-12" });
    const dateCands = b.candidates.filter((c) => c.fieldKey === "activity_date");
    expect(new Set(dateCands.map((c) => c.value))).toEqual(new Set(["2031-01-12", "2031-01-13"]));
    expect(dateCands.every((c) => c.snippet && c.rule)).toBe(true);
  });

  it("reports cannot be approved while issues remain", async () => {
    await svc.generateReports(sql, faculty, id);
    await expect(svc.approveActivity(sql, faculty, id)).rejects.toThrow(/cannot be approved until required fields are resolved/);
    const a = await svc.getActivity(sql, faculty, id);
    expect(a.status).toBe("REVIEW_REQUIRED");
  });

  it("reviewer resolves the conflict by choosing a candidate; history is audited", async () => {
    const b = await svc.loadActivityBundle(sql, faculty, id);
    const chosen = b.candidates.find((c) => c.fieldKey === "activity_date" && c.value === "2031-01-12")!;
    await svc.chooseCandidate(sql, faculty, id, "activity_date", chosen.id);
    const after = await svc.loadActivityBundle(sql, faculty, id);
    const f = after.state.fields.find((x) => x.field_key === "activity_date")!;
    expect(f).toMatchObject({ value: "2031-01-12", status: "extracted", source_id: reportSrc, edited_by: faculty.id });
    expect(after.audit.map((a) => a.action)).toContain("field.conflict_resolved");
  });

  it("manual edits keep the original extracted value, editor and time", async () => {
    await svc.setField(sql, faculty, id, "category", { value: "Technical Workshop" });
    const b = await svc.loadActivityBundle(sql, faculty, id);
    const f = b.state.fields.find((x) => x.field_key === "category")!;
    expect(f).toMatchObject({ value: "Technical Workshop", status: "user_entered", original_value: "Technical", edited_by: faculty.id });
    expect(f.edited_at).toBeInstanceOf(Date);
    const log = b.audit.find((a) => a.action === "field.edited")!;
    expect(log.details).toMatchObject({ field: "category", before: "Technical", after: "Technical Workshop" });
  });

  it("attendance mismatch is flagged, not corrected", async () => {
    await svc.addAttendanceRow(sql, faculty, id, { serialNo: 1, studentName: "Synthetic Student One", gender: "male" });
    await svc.addAttendanceRow(sql, faculty, id, { serialNo: 2, studentName: "Synthetic Student Two", gender: "female" });
    const b = await svc.loadActivityBundle(sql, faculty, id);
    expect(b.state.reconciliation.overall).toBe("FAIL");
    expect(b.state.reconciliation.messages.join()).toMatch(/2 attendance rows vs stated total 3/);
    const total = b.state.fields.find((x) => x.field_key === "total_count")!;
    expect(total.value).toBe("3");
  });

  it("CSV import adds rows; gender only when written", async () => {
    const r = await svc.importAttendanceCsv(sql, faculty, id, "Sr No,Name,Gender\n3,Synthetic Student Three,M\n4,Synthetic Student Four,\n");
    expect(r.imported).toBe(2);
    const rows = await svc.listAttendance(sql, id);
    expect(rows.find((x) => x.serial_no === 4)!.gender).toBe("unspecified");
    await svc.deleteAttendanceRow(sql, faculty, id, rows.find((x) => x.serial_no === 4)!.id);
  });

  it("acknowledgement is required text and is invalidated when counts change", async () => {
    // 3 rows (M,F,M) vs stated M2 F1 T3 -> totals match, male count 2 == 2 -> should pass now
    let b = await svc.loadActivityBundle(sql, faculty, id);
    expect(b.state.reconciliation.checks.find((c) => c.id === "attendance_total")!.result).toBe("PASS");
    await svc.setField(sql, faculty, id, "total_count", { value: "4" });
    b = await svc.loadActivityBundle(sql, faculty, id);
    expect(b.state.reconciliation.overall).toBe("FAIL");
    await expect(svc.acknowledgeReconciliation(sql, faculty, id, "short")).rejects.toThrow(/at least 10/);
    await svc.acknowledgeReconciliation(sql, faculty, id, "One student left before signing the sheet.");
    b = await svc.loadActivityBundle(sql, faculty, id);
    expect(b.state.ackValid).toBe(true);
    await svc.setField(sql, faculty, id, "total_count", { value: "5" });
    b = await svc.loadActivityBundle(sql, faculty, id);
    expect(b.state.ackValid).toBe(false);
    await svc.setField(sql, faculty, id, "total_count", { value: "3" });
  });

  it("low-confidence extractions must be confirmed; stale reports block approval", async () => {
    let b = await svc.loadActivityBundle(sql, faculty, id);
    for (const f of b.state.fields.filter((x) => x.status === "extracted" && !x.edited_by)) {
      await svc.confirmField(sql, faculty, id, f.field_key);
    }
    expect(b.state.reconciliation.overall).toBe("UNVERIFIED"); // CSV row not yet checked
    await svc.verifyAllAttendance(sql, faculty, id);
    b = await svc.loadActivityBundle(sql, faculty, id);
    expect(b.state.reconciliation.overall).toBe("PASS");
    expect(b.state.blocking.map((x) => x.code)).toEqual(["reports_stale"]);
    await svc.generateReports(sql, faculty, id);
    b = await svc.loadActivityBundle(sql, faculty, id);
    expect(b.state.blocking).toEqual([]);
    expect(b.activity.status).toBe("READY_FOR_APPROVAL");
  });

  it("generated reports contain only provided data", async () => {
    const reports = await svc.latestReports(sql, id);
    const ar = reports.find((r) => r.report_type === "activity_report")!.content as { detailRows: { label: string; text: string }[]; narrativeRows: { label: string; text: string }[] };
    expect(ar.detailRows.find((r) => r.label === "Date of Activity")!.text).toBe("12/01/2031  Time: 10.00 am");
    expect(ar.detailRows.find((r) => r.label === "Details of Invited Speaker")!.text).toBe("Not provided");
    const dr = reports.find((r) => r.report_type === "detailed_report")!.content as { description: string; impact: string };
    expect(dr.description).toContain("Introduce robotics.");
    expect(dr.impact).toBe("Robots assembled.");
    const at = reports.find((r) => r.report_type === "attendance_summary")!.content as { reconciliation: { overall: string } };
    expect(at.reconciliation.overall).toBe("PASS");
  });

  it("approval records approver and locks the activity", async () => {
    await svc.approveActivity(sql, faculty, id);
    const a = await svc.getActivity(sql, faculty, id);
    expect(a.status).toBe("APPROVED");
    expect(a.approved_by).toBe(faculty.id);
    expect(a.approved_at).toBeInstanceOf(Date);
    await expect(svc.setField(sql, faculty, id, "title", { value: "Changed" })).rejects.toThrow(/approved/);
    await expect(svc.addSource(sql, faculty, id, { kind: "notice", filename: "n.pdf", bytes: await pdf() })).rejects.toThrow(/approved/);
    await expect(svc.approveActivity(sql, faculty, id)).rejects.toThrow(/already approved/);
    const actions = (await svc.loadActivityBundle(sql, faculty, id)).audit.map((x) => x.action);
    for (const act of ["activity.created", "source.uploaded", "extraction.completed", "field.edited", "report.generated", "activity.approved"]) {
      expect(actions).toContain(act);
    }
  });

  it("extraction that yields no text is reported as a failure", async () => {
    const id2 = await svc.createActivity(sql, faculty, { fields: {} });
    const s = await svc.addSource(sql, faculty, id2, { kind: "notice", filename: "blank.pdf", bytes: await pdf(2) });
    const r = await svc.saveExtraction(sql, faculty, s.id, { engine: "test", pages: [{ page: 1, method: "ocr", text: " ", confidence: 0 }, { page: 2, method: "ocr", text: "", confidence: 0 }] });
    expect(r.status).toBe("failed");
    const b = await svc.loadActivityBundle(sql, faculty, id2);
    expect(b.sources[0].extraction_error).toBe("Could not extract text from this file.");
    expect(b.state.warnings.map((w) => w.code)).toContain("extraction_failed");
    await expect(svc.saveExtraction(sql, faculty, s.id, { engine: "t", pages: [{ page: 9, method: "ocr", text: "x", confidence: 1 }] })).rejects.toThrow(/does not exist/);
  });

  it("OCR failure reported by the browser is recorded", async () => {
    const id3 = await svc.createActivity(sql, faculty, { fields: {} });
    const s = await svc.addSource(sql, faculty, id3, { kind: "attendance", filename: "att.pdf", bytes: await pdf(1) });
    await svc.markExtraction(sql, faculty, s.id, "processing");
    expect((await svc.getActivity(sql, faculty, id3)).status).toBe("PROCESSING");
    await svc.markExtraction(sql, faculty, s.id, "failed", "OCR engine could not load");
    const b = await svc.loadActivityBundle(sql, faculty, id3);
    expect(b.sources[0].extraction_status).toBe("failed");
    expect(b.activity.status).toBe("DRAFT");
  });
});
