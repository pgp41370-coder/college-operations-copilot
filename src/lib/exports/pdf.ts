/**
 * PDF rendering of report content with pdf-lib (runs on server or browser).
 * Uses the standard Times font (as in the reference reports). Characters the
 * standard font cannot encode (e.g. Devanagari) are replaced with "?" and the
 * document says so — the DOCX export preserves them.
 */
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { ActivityReportContent, AttendanceSummaryContent, DetailedReportContent } from "../reports/build";
import { APP_NAME } from "../brand";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;

export interface Footer {
  text: string;
}

class Writer {
  page!: PDFPage;
  y = 0;
  replaced = 0;
  private supported: Set<number>;
  constructor(
    public doc: PDFDocument,
    public font: PDFFont,
    public bold: PDFFont,
    private footer: string,
  ) {
    this.supported = new Set(font.getCharacterSet());
    this.newPage();
  }
  get width() {
    return A4[0] - MARGIN * 2;
  }
  safe(s: string): string {
    let out = "";
    for (const ch of s.replace(/\t/g, "    ")) {
      const cp = ch.codePointAt(0)!;
      if (ch === "\n" || this.supported.has(cp)) out += ch;
      else {
        out += "?";
        this.replaced++;
      }
    }
    return out;
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
    const f = this.safe(this.footer);
    this.page.drawText(f, { x: MARGIN, y: 25, size: 7.5, font: this.font, color: rgb(0.35, 0.35, 0.35) });
  }
  ensure(h: number) {
    if (this.y - h < MARGIN) this.newPage();
  }
  wrap(text: string, size: number, width: number, font = this.font): string[] {
    const lines: string[] = [];
    for (const para of this.safe(text).split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const w of words) {
        const trial = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(trial, size) <= width) line = trial;
        else {
          if (line) lines.push(line);
          // Break very long tokens.
          let rest = w;
          while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
            let n = rest.length;
            while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
            lines.push(rest.slice(0, n));
            rest = rest.slice(n);
          }
          line = rest;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  text(text: string, opts: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; gap?: number; underline?: boolean } = {}) {
    const size = opts.size ?? 11;
    const font = opts.bold ? this.bold : this.font;
    for (const line of this.wrap(text, size, this.width, font)) {
      this.ensure(size + 4);
      const w = font.widthOfTextAtSize(line, size);
      const x = opts.align === "center" ? MARGIN + (this.width - w) / 2 : opts.align === "right" ? MARGIN + this.width - w : MARGIN;
      this.page.drawText(line, { x, y: this.y - size, size, font });
      if (opts.underline) this.page.drawLine({ start: { x, y: this.y - size - 1.5 }, end: { x: x + w, y: this.y - size - 1.5 }, thickness: 0.6 });
      this.y -= size + 3;
    }
    this.y -= opts.gap ?? 0;
  }
  /** Bordered table; each row is an array of cell strings. */
  table(rows: { cells: string[]; bold?: boolean[] }[], colWidths: number[], opts: { size?: number; minRowHeight?: number; borders?: boolean } = {}) {
    const size = opts.size ?? 10.5;
    const pad = 4;
    const lh = size + 2.5;
    const borders = opts.borders !== false;
    for (const row of rows) {
      const wrapped = row.cells.map((c, i) => this.wrap(c, size, colWidths[i] - pad * 2, row.bold?.[i] ? this.bold : this.font));
      let lineIdx = 0;
      const maxLines = Math.max(...wrapped.map((w) => w.length));
      while (lineIdx < maxLines) {
        // Split rows across pages when needed.
        const avail = Math.max(1, Math.floor((this.y - MARGIN - pad * 2) / lh));
        if (avail < 2 && lineIdx === 0) {
          this.newPage();
          continue;
        }
        const take = Math.min(maxLines - lineIdx, avail);
        const h = Math.max(take * lh + pad * 2, lineIdx === 0 ? (opts.minRowHeight ?? 0) : 0);
        this.ensure(h);
        let x = MARGIN;
        row.cells.forEach((_, i) => {
          const font = row.bold?.[i] ? this.bold : this.font;
          wrapped[i].slice(lineIdx, lineIdx + take).forEach((line, j) => {
            this.page.drawText(line, { x: x + pad, y: this.y - pad - size - j * lh, size, font });
          });
          if (borders) this.page.drawRectangle({ x, y: this.y - h, width: colWidths[i], height: h, borderWidth: 0.7, borderColor: rgb(0, 0, 0) });
          x += colWidths[i];
        });
        this.y -= h;
        lineIdx += take;
        if (lineIdx < maxLines) this.newPage();
      }
    }
  }
  rule() {
    this.ensure(6);
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 2 }, end: { x: MARGIN + this.width, y: this.y - 2 }, thickness: 1.5 });
    this.y -= 8;
  }
  space(h: number) {
    this.y -= h;
  }
}

async function writer(footer: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  return new Writer(doc, font, bold, footer);
}

async function finish(w: Writer, title: string): Promise<Uint8Array> {
  if (w.replaced > 0) {
    w.space(10);
    w.text(`Note: ${w.replaced} character(s) could not be shown in this PDF font and appear as "?". The DOCX export contains the original text.`, { size: 8 });
  }
  w.doc.setTitle(title);
  w.doc.setProducer(APP_NAME);
  return w.doc.save();
}

export async function activityReportPdf(c: ActivityReportContent, footer: string): Promise<Uint8Array> {
  const w = await writer(footer);
  c.titleLines.forEach((l) => w.text(l, { bold: true, align: "center", size: 12 }));
  w.space(8);
  w.text(c.heading, { bold: true, align: "center", size: 12, gap: 6 });
  const W = w.width;
  w.table(c.detailRows.map((r) => ({ cells: [r.label, r.text] })), [W * 0.3, W * 0.7]);
  w.space(12);
  w.table(c.narrativeRows.map((r) => ({ cells: [r.label, r.text], bold: [true, false] })), [W * 0.25, W * 0.75]);
  w.space(12);
  const cw = W / c.signatories.length;
  w.table([{ cells: c.signatories.map((s) => s.heading), bold: c.signatories.map(() => true) }], c.signatories.map(() => cw));
  w.table(
    [{ cells: c.signatories.map((s) => ["", "", "(signature)", ...s.lines].join("\n")) }],
    c.signatories.map(() => cw),
    { size: 9.5, minRowHeight: 110 },
  );
  return finish(w, "Activity Report");
}

export async function detailedReportPdf(c: DetailedReportContent, footer: string): Promise<Uint8Array> {
  const w = await writer(footer);
  c.letterheadLines.forEach((l, i) => w.text(l, { bold: i < 2, align: "center", size: i === 0 ? 14 : i === 1 ? 12 : 10 }));
  w.rule();
  w.text(c.dateLine, { align: "right", size: 11, gap: 4 });
  w.text(c.heading, { bold: true, align: "center", size: 12, gap: 8 });
  w.text(`${c.topicLabel} ${c.topic}`, { bold: true, size: 11.5, gap: 8 });
  c.description.split(/\n{2,}/).forEach((p) => w.text(p, { size: 11.5, gap: 6 }));
  w.space(6);
  w.text(c.impactHeading, { bold: true, underline: true, size: 11.5, gap: 2 });
  c.impact.split(/\n{2,}/).forEach((p) => w.text(p, { size: 11.5, gap: 6 }));
  w.space(40);
  const W = w.width;
  w.table(
    [{ cells: c.signatories.map((s) => ["(signature)", ...s.lines].join("\n")) }],
    c.signatories.map(() => W / c.signatories.length),
    { size: 10.5, borders: false },
  );
  return finish(w, "Detailed Report");
}

export async function attendanceSummaryPdf(c: AttendanceSummaryContent, footer: string): Promise<Uint8Array> {
  const w = await writer(footer);
  w.text(c.heading, { bold: true, align: "center", size: 14, gap: 4 });
  w.text(`Activity: ${c.title}`, { size: 11 });
  w.text(`Date of activity: ${c.activityDate}`, { size: 11, gap: 8 });
  const r = c.reconciliation;
  const n = (v: number | null) => (v == null ? "Not provided" : String(v));
  const W = w.width;
  w.table(
    [
      { cells: ["", "Stated in report", "Attendance rows"], bold: [true, true, true] },
      { cells: ["Total participants", n(r.stated.total), String(r.attendance.rows)] },
      { cells: ["Male", n(r.stated.male), String(r.attendance.male)] },
      { cells: ["Female", n(r.stated.female), String(r.attendance.female)] },
      { cells: ["Gender not specified", "—", String(r.attendance.unspecified)] },
      { cells: ["Rows verified by reviewer", "—", `${r.attendance.verifiedRows} of ${r.attendance.rows}`] },
    ],
    [W * 0.4, W * 0.3, W * 0.3],
  );
  w.space(8);
  w.text(`Reconciliation: ${r.overall.replace("_", " ")}`, { bold: true, size: 12, gap: 2 });
  r.checks.forEach((ch) => w.text(`• ${ch.label}: ${ch.result.replace("_", " ")} — ${ch.detail}`, { size: 10 }));
  r.messages.forEach((m) => w.text(`! ${m}`, { size: 10 }));
  if (c.acknowledgement) w.text(`Mismatch acknowledged by ${c.acknowledgement.by} (${c.acknowledgement.at.slice(0, 10)}): ${c.acknowledgement.note}`, { size: 10 });
  w.text(`Source documents: ${c.sources.join(", ") || "None recorded"}`, { size: 10, gap: 8 });
  w.text("Gender is recorded only where written on the attendance sheet; it is never inferred from names.", { size: 9, gap: 8 });
  if (c.rows.length) {
    w.table(
      [
        { cells: ["Sr.", "Name", "Gender", "Entry", "Verified"], bold: [true, true, true, true, true] },
        ...c.rows.map((x) => ({ cells: [x.serialNo == null ? "" : String(x.serialNo), x.studentName, x.gender, x.method.toUpperCase(), x.verified ? "Yes" : "No"] })),
      ],
      [W * 0.08, W * 0.5, W * 0.14, W * 0.14, W * 0.14],
      { size: 9.5 },
    );
  }
  return finish(w, "Attendance Summary");
}

/** Title page used between sections of the compiled evidence packet. */
export async function sectionPagePdf(title: string, lines: string[] = []): Promise<Uint8Array> {
  const w = await writer("");
  w.space(250);
  w.text(title, { bold: true, align: "center", size: 18, gap: 10 });
  lines.forEach((l) => w.text(l, { align: "center", size: 11 }));
  return finish(w, title);
}

/** One photo per page with its caption (captions are user-entered, never inferred). */
export async function addImagePage(doc: PDFDocument, bytes: Uint8Array, mime: string, caption: string | null, heading?: string) {
  const img = mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const page = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const supported = new Set(font.getCharacterSet());
  const safe = (s: string) => [...s].map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : "?")).join("");
  let top = A4[1] - MARGIN;
  if (heading) {
    const t = safe(heading);
    page.drawText(t, { x: (A4[0] - bold.widthOfTextAtSize(t, 13)) / 2, y: top - 13, size: 13, font: bold });
    top -= 30;
  }
  const maxW = A4[0] - MARGIN * 2;
  const maxH = top - MARGIN - 40;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: (A4[0] - w) / 2, y: top - h, width: w, height: h });
  if (caption) {
    const c = safe(caption).slice(0, 200);
    page.drawText(c, { x: Math.max(MARGIN, (A4[0] - font.widthOfTextAtSize(c, 11)) / 2), y: top - h - 18, size: 11, font });
  }
}
