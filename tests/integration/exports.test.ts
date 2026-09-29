import { afterAll, beforeAll, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import type postgres from "postgres";
import * as svc from "@/lib/server/activities";
import { buildExport } from "@/lib/server/exports";
import { makeUser, testSql } from "../helpers/db";

let sql: postgres.Sql;
let user: Awaited<ReturnType<typeof makeUser>>;
let id: string;

beforeAll(async () => {
  sql = testSql();
  user = await makeUser(sql, "faculty");
  id = await svc.createActivity(sql, user, {
    fields: { title: "Synthetic Seminar", category: "Technical", objectives: "Explain things.", male_count: "1", female_count: "0", total_count: "1" },
  });
  await svc.addAttendanceRow(sql, user, id, { serialNo: 1, studentName: "=HYPERLINK(\"http://x\")", gender: "male" });
});
afterAll(async () => sql.end());

describe("exports", () => {
  it("refuses report exports before generation", async () => {
    await expect(buildExport(sql, user, id, "activity_report", "pdf")).rejects.toThrow(/Generate the reports first/);
  });

  it("produces valid PDF and DOCX files marked DRAFT", async () => {
    await svc.generateReports(sql, user, id);
    for (const type of ["activity_report", "detailed_report", "attendance_summary"] as const) {
      const pdf = await buildExport(sql, user, id, type, "pdf");
      const doc = await PDFDocument.load(pdf.body);
      expect(doc.getPageCount()).toBeGreaterThan(0);
      const docx = await buildExport(sql, user, id, type, "docx");
      const xml = await (await JSZip.loadAsync(docx.body)).file("word/document.xml")!.async("string");
      expect(xml).toContain("Synthetic Seminar");
      const footer = Object.keys((await JSZip.loadAsync(docx.body)).files).find((f) => f.startsWith("word/footer"))!;
      expect(await (await JSZip.loadAsync(docx.body)).file(footer)!.async("string")).toContain("DRAFT");
    }
  });

  it("CSV export neutralises spreadsheet formulas", async () => {
    const csv = new TextDecoder().decode((await buildExport(sql, user, id, "attendance_csv", "csv")).body);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
  });

  it("manifest carries provenance and the audit trail", async () => {
    const m = JSON.parse(new TextDecoder().decode((await buildExport(sql, user, id, "manifest", "json")).body));
    const title = m.fields.find((f: { key: string }) => f.key === "title");
    expect(title).toMatchObject({ value: "Synthetic Seminar", status: "user_entered", method: "manual" });
    expect(m.fields.find((f: { key: string }) => f.key === "outcomes")).toMatchObject({ value: null, status: "missing" });
    expect(m.auditTrail.map((a: { action: string }) => a.action)).toContain("report.generated");
    expect(m.reports).toHaveLength(3);
  });

  it("exports are audited", async () => {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from audit_logs where activity_id = ${id} and action = 'export.downloaded'`;
    expect(n).toBeGreaterThanOrEqual(7);
  });
});
