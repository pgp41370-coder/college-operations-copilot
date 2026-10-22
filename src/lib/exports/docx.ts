/**
 * Editable Word (.docx) exports. Faculty typically print, sign and file these;
 * DOCX keeps every character (including non-Latin scripts) and stays editable.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from "docx";
import type { ActivityReportContent, AttendanceSummaryContent, DetailedReportContent } from "../reports/build";
import { APP_NAME } from "../brand";

const FONT = "Times New Roman";

function p(text: string, o: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; underline?: boolean; after?: number } = {}) {
  return new Paragraph({
    alignment: o.align,
    spacing: { after: o.after ?? 60 },
    children: text.split("\n").map(
      (line, i) =>
        new TextRun({
          text: line,
          break: i > 0 ? 1 : undefined,
          bold: o.bold,
          size: (o.size ?? 11) * 2,
          font: FONT,
          underline: o.underline ? { type: UnderlineType.SINGLE } : undefined,
        }),
    ),
  });
}

function cell(text: string, widthPct: number, o: { bold?: boolean; minLines?: number; noBorder?: boolean; size?: number } = {}) {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const lines = text.split(/\n{2,}/);
  const extra = Array.from({ length: o.minLines ?? 0 }, () => p(""));
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: o.noBorder ? { top: none, bottom: none, left: none, right: none } : undefined,
    children: [...extra, ...lines.map((l) => p(l, { bold: o.bold, size: o.size }))],
  });
}

function table(rows: TableCell[][]) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((cells) => new TableRow({ children: cells })) });
}

function footer(text: string) {
  return new Footer({ children: [p(text, { size: 8 })] });
}

async function pack(children: (Paragraph | Table)[], footerText: string): Promise<Uint8Array> {
  const doc = new Document({
    creator: APP_NAME,
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, footers: { default: footer(footerText) }, children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

export async function activityReportDocx(c: ActivityReportContent, footerText: string) {
  const n = c.signatories.length;
  return pack(
    [
      ...c.titleLines.map((l) => p(l, { bold: true, align: AlignmentType.CENTER, size: 12, after: 0 })),
      p(""),
      p(c.heading, { bold: true, align: AlignmentType.CENTER, size: 12 }),
      table(c.detailRows.map((r) => [cell(r.label, 32), cell(r.text, 68)])),
      p(""),
      table(c.narrativeRows.map((r) => [cell(r.label, 25, { bold: true }), cell(r.text, 75)])),
      p(""),
      table([
        c.signatories.map((s) => cell(s.heading, 100 / n, { bold: true })),
        c.signatories.map((s) => cell(["(signature)", ...s.lines].join("\n"), 100 / n, { minLines: 3, size: 10 })),
      ]),
    ],
    footerText,
  );
}

export async function detailedReportDocx(c: DetailedReportContent, footerText: string) {
  return pack(
    [
      ...c.letterheadLines.map((l, i) => p(l, { bold: i < 2, align: AlignmentType.CENTER, size: i === 0 ? 14 : i === 1 ? 12 : 10, after: 0 })),
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000", space: 1 } }, children: [] }),
      p(c.dateLine, { align: AlignmentType.RIGHT }),
      p(c.heading, { bold: true, align: AlignmentType.CENTER, size: 12 }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: `${c.topicLabel} `, bold: true, font: FONT, size: 23 }), new TextRun({ text: c.topic, font: FONT, size: 23 })],
      }),
      ...c.description.split(/\n{2,}/).map((t) => p(t, { size: 11.5, align: AlignmentType.JUSTIFIED, after: 120 })),
      p(c.impactHeading, { bold: true, underline: true, size: 11.5 }),
      ...c.impact.split(/\n{2,}/).map((t) => p(t, { size: 11.5, align: AlignmentType.JUSTIFIED, after: 120 })),
      p(""),
      p(""),
      table([c.signatories.map((s) => cell(["(signature)", ...s.lines].join("\n"), 100 / c.signatories.length, { noBorder: true }))]),
    ],
    footerText,
  );
}

export async function attendanceSummaryDocx(c: AttendanceSummaryContent, footerText: string) {
  const r = c.reconciliation;
  const n = (v: number | null) => (v == null ? "Not provided" : String(v));
  return pack(
    [
      p(c.heading, { bold: true, align: AlignmentType.CENTER, size: 14 }),
      p(`Activity: ${c.title}`),
      p(`Date of activity: ${c.activityDate}`),
      table([
        [cell("", 40), cell("Stated in report", 30, { bold: true }), cell("Attendance rows", 30, { bold: true })],
        [cell("Total participants", 40), cell(n(r.stated.total), 30), cell(String(r.attendance.rows), 30)],
        [cell("Male", 40), cell(n(r.stated.male), 30), cell(String(r.attendance.male), 30)],
        [cell("Female", 40), cell(n(r.stated.female), 30), cell(String(r.attendance.female), 30)],
        [cell("Gender not specified", 40), cell("—", 30), cell(String(r.attendance.unspecified), 30)],
      ]),
      p(`Reconciliation: ${r.overall.replace("_", " ")}`, { bold: true }),
      ...r.checks.map((ch) => p(`• ${ch.label}: ${ch.result.replace("_", " ")} — ${ch.detail}`, { size: 10 })),
      ...r.messages.map((m) => p(`! ${m}`, { size: 10 })),
      p("Gender is recorded only where written on the attendance sheet; it is never inferred from names.", { size: 9 }),
    ],
    footerText,
  );
}
