/**
 * Generates SYNTHETIC demo documents (no real people, no real institution
 * records). Every document carries a "DEMO DATA — SYNTHETIC" mark.
 * They mirror the structure of the pilot packets, including the pattern
 * seen there: the poster prints a commemorated day (31 Oct) while the
 * notice and report give the activity date (6 Nov).
 *
 *   npx tsx scripts/demo/make-demo-docs.mts   -> demo/input/*
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const OUT = path.join(process.cwd(), "demo", "input");
const MARK = `<div style="position:absolute;bottom:18px;right:24px;font:600 13px Arial;color:#b42318;border:1.5px solid #b42318;padding:2px 8px">DEMO DATA — SYNTHETIC</div>`;

const letterhead = `
  <div style="text-align:center;border-bottom:3px solid #000;padding-bottom:8px;margin-bottom:14px">
    <div style="font:bold 22px Arial">DEPARTMENT OF MECHANICAL ENGINEERING</div>
    <div style="font:bold 17px Arial">DEMO INSTITUTE OF ENGINEERING</div>
    <div style="font:14px Arial">Demo Campus Road, Demo City</div>
  </div>`;

const docs: Record<string, { width: number; height: number; html: string }> = {
  poster: {
    width: 1600,
    height: 900,
    html: `<div style="width:1600px;height:900px;background:#fbf4e6;position:relative;font-family:Arial;text-align:center;padding-top:40px;box-sizing:border-box">
      <div style="font:bold 44px Arial;color:#c2410c">DEMO INSTITUTE OF ENGINEERING</div>
      <div style="font:bold 34px Arial;color:#15803d;margin-top:18px">DEPARTMENT OF MECHANICAL ENGINEERING</div>
      <div style="font:bold 30px Arial;color:#15803d">IN COLLABORATION WITH DEMO STUDENT ASSOCIATION</div>
      <div style="font:28px Arial;margin-top:22px">celebrates</div>
      <div style="font:bold 76px Georgia;color:#7e22ce">DEMO UNITY WEEK</div>
      <div style="font:bold 36px Arial;color:#581c87;margin-top:6px">31ST OCTOBER, 2026</div>
      <div style="font:30px Arial;margin-top:26px">organizes</div>
      <div style="font:bold 48px Arial;color:#7f1d1d">ENGINEERING DRAWING QUIZ</div>
      ${MARK}</div>`,
  },
  notice: { width: 0, height: 0, html: "" },
  report: {
    width: 1275,
    height: 1650,
    html: `<div style="width:1275px;height:1650px;background:#fff;position:relative;font-family:'Times New Roman';font-size:25px;padding:70px 90px;box-sizing:border-box;line-height:1.3">
      <div style="text-align:center;font-weight:bold">DEMO INSTITUTE OF ENGINEERING<br>Activity Report<br>Session: 2026-27<br>Department of Mechanical Engineering<br><br>Activity Report</div>
      <table style="border-collapse:collapse;width:100%;margin-top:16px" border="1" cellpadding="6">
        <tr><td style="width:36%">Category of the Activity:</td><td>Technical</td></tr>
        <tr><td>Title of the Activity</td><td>Engineering Drawing Quiz</td></tr>
        <tr><td>Coordinator</td><td>Demo Coordinator A, Demo Coordinator B</td></tr>
        <tr><td>Date of Activity</td><td>06/11/2026 Time: 11.00 am</td></tr>
        <tr><td>No. of Students Involved:</td><td>Male: 5 &nbsp;&nbsp; Female: 3 &nbsp;&nbsp; Total: 8</td></tr>
        <tr><td>Association/Collaboration</td><td>Demo Student Association</td></tr>
        <tr><td>Details of Invited Speaker</td><td style="text-align:center">------</td></tr>
      </table>
      <table style="border-collapse:collapse;width:100%;margin-top:22px" border="1" cellpadding="6">
        <tr><td style="width:26%;font-weight:bold">Brief about an Activity</td><td>Second-year students answered timed questions on orthographic projection, sectional views and dimensioning standards.</td></tr>
        <tr><td style="font-weight:bold">Objectives</td><td>To test and strengthen students' reading of engineering drawings and their knowledge of drawing standards.</td></tr>
        <tr><td style="font-weight:bold">Outcomes</td><td>Students identified common dimensioning errors and practised reading sectional views under time pressure.</td></tr>
      </table>
      <table style="border-collapse:collapse;width:100%;margin-top:22px;text-align:center" border="1" cellpadding="6">
        <tr style="font-weight:bold"><td>Faculty Coordinator</td><td>HoD/ Committee Incharge</td><td>IQAC Coordinator</td><td>Principal</td></tr>
        <tr style="height:140px"><td></td><td></td><td></td><td></td></tr>
      </table>
      ${MARK}</div>`,
  },
  attendance: {
    width: 1275,
    height: 1650,
    html: `<div style="width:1275px;height:1650px;background:#fff;position:relative;font-family:Arial;font-size:25px;padding:60px 90px;box-sizing:border-box">
      ${letterhead}
      <div style="text-align:right">Date:- 06/11/2026</div>
      <div style="text-align:center;font-weight:bold;text-decoration:underline;margin:10px 0">Attendance Sheet</div>
      <div>Topic- "Engineering Drawing Quiz" on 6th November 2026.</div>
      <table style="border-collapse:collapse;width:100%;margin-top:18px" border="1" cellpadding="7">
        <tr style="font-weight:bold"><td style="width:10%">Sr. No.</td><td>Name of Student</td><td style="width:18%">Gender</td><td style="width:18%">Student Sign</td></tr>
        ${[
          ["1", "Demo Student Aarav", "Male"],
          ["2", "Demo Student Bina", "Female"],
          ["3", "Demo Student Chetan", "Male"],
          ["4", "Demo Student Divya", "Female"],
          ["5", "Demo Student Eshan", "Male"],
          ["6", "Demo Student Farhan", "Male"],
          ["7", "Demo Student Gauri", "Female"],
          ["8", "", ""],
          ["9", "", ""],
        ]
          .map(([n, name, g]) => `<tr><td>${n}</td><td>${name}</td><td>${g}</td><td>${name ? "signed" : ""}</td></tr>`)
          .join("")}
      </table>
      ${MARK}</div>`,
  },
  photo: {
    width: 1200,
    height: 800,
    html: `<div style="width:1200px;height:800px;position:relative;background:linear-gradient(160deg,#dbeafe,#f1f5f9);font-family:Arial">
      <div style="position:absolute;left:80px;top:120px;width:1040px;height:430px;background:#e2e8f0;border:3px solid #94a3b8;border-radius:8px"></div>
      ${Array.from({ length: 16 }, (_, i) => `<div style="position:absolute;left:${130 + (i % 8) * 125}px;top:${230 + Math.floor(i / 8) * 150}px;width:70px;height:70px;border-radius:50%;background:#64748b"></div><div style="position:absolute;left:${118 + (i % 8) * 125}px;top:${300 + Math.floor(i / 8) * 150}px;width:94px;height:60px;background:#475569;border-radius:12px 12px 0 0"></div>`).join("")}
      <div style="position:absolute;left:0;right:0;bottom:120px;text-align:center;font:bold 34px Arial;color:#334155">Illustration standing in for an event photograph</div>
      ${MARK}</div>`,
  },
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const shots: Record<string, Buffer> = {};
  for (const [name, d] of Object.entries(docs)) {
    if (!d.html) continue;
    const page = await browser.newPage({ viewport: { width: d.width, height: d.height } });
    await page.setContent(`<body style="margin:0">${d.html}</body>`);
    shots[name] = await page.screenshot({ type: name === "photo" ? "jpeg" : "png", quality: name === "photo" ? 85 : undefined });
    await page.close();
  }
  await browser.close();

  writeFileSync(path.join(OUT, "demo-poster.png"), shots.poster);
  writeFileSync(path.join(OUT, "demo-attendance-sheet.png"), shots.attendance);
  writeFileSync(path.join(OUT, "demo-event-photo.jpg"), shots.photo);

  // Scanned activity report: an image-only PDF, so the app must OCR it.
  const scan = await PDFDocument.create();
  const img = await scan.embedPng(shots.report);
  const page = scan.addPage([612, 792]);
  page.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  writeFileSync(path.join(OUT, "demo-activity-report-scan.pdf"), await scan.save());

  // Notice: a digital PDF with a text layer (no OCR needed).
  const notice = await PDFDocument.create();
  const font = await notice.embedFont(StandardFonts.TimesRoman);
  const bold = await notice.embedFont(StandardFonts.TimesRomanBold);
  const p = notice.addPage([595, 842]);
  const line = (t: string, y: number, f = font, size = 12, x = 60) => p.drawText(t, { x, y, size, font: f });
  line("DEPARTMENT OF MECHANICAL ENGINEERING", 790, bold, 15, 150);
  line("DEMO INSTITUTE OF ENGINEERING", 770, bold, 13, 190);
  line("Date:- 02/11/2026", 730, font, 12, 430);
  line("NOTICE", 690, bold, 13, 270);
  line("All the students of Mechanical Engineering Department are hereby informed that an", 650);
  line("“Engineering Drawing Quiz” has been organized on 6th November 2026. You are", 632);
  line("instructed to remain present at 11.00 am in Seminar Hall B-12 for the same.", 614);
  line("Demo Coordinator A", 520);
  line("Co-ordinator", 502);
  line("DEMO DATA — SYNTHETIC", 60, bold, 10, 420);
  writeFileSync(path.join(OUT, "demo-notice.pdf"), await notice.save());
  console.log("wrote", Object.keys(shots).length + 1, "documents to demo/input/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
