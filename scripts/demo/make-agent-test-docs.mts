/**
 * Generates a NEW set of SYNTHETIC test packets for end-to-end testing of the
 * app and its agents (different events and scenarios from make-demo-docs.mts).
 * No real people, no real institution: every page carries "TEST DATA — SYNTHETIC".
 *
 *   npx tsx scripts/demo/make-agent-test-docs.mts   -> demo/test-packets/*
 *
 * A  Guest lecture, complete packet: poster date differs from the report date
 *    (conflict), scanned activity report (OCR), detailed report, attendance sheet
 *    with one row fewer than the stated total (count mismatch), photograph.
 * B  Industrial visit, incomplete: activity report + photograph only
 *    (poster, notice and attendance missing).
 * C  Hackathon, wrong types on purpose: a notice to upload as "Poster" and an
 *    attendance sheet to upload as "Supporting document".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const ROOT = path.join(process.cwd(), "demo", "test-packets");
const MARK = `<div style="position:absolute;bottom:18px;right:24px;font:600 13px Arial;color:#b42318;border:1.5px solid #b42318;padding:2px 8px">TEST DATA — SYNTHETIC</div>`;
const INST = "SAMPLE INSTITUTE OF TECHNOLOGY";
const head = `
  <div style="text-align:center;border-bottom:3px solid #000;padding-bottom:8px;margin-bottom:14px">
    <div style="font:bold 22px Arial">DEPARTMENT OF MECHANICAL ENGINEERING</div>
    <div style="font:bold 17px Arial">${INST}</div>
    <div style="font:14px Arial">Sample Campus Road, Sample City</div>
  </div>`;

const page = (w: number, h: number, inner: string, extra = "") =>
  `<div style="width:${w}px;height:${h}px;background:#fff;position:relative;box-sizing:border-box;${extra}">${inner}${MARK}</div>`;

function activityReport(o: {
  session: string; category: string; title: string; coordinator: string; date: string; time: string;
  male: number; female: number; total: number; association: string; speaker: string; brief: string; objectives: string; outcomes: string;
}) {
  return page(1275, 1650, `
    <div style="text-align:center;font-weight:bold">${INST}<br>Activity Report<br>Session: ${o.session}<br>Department of Mechanical Engineering<br><br>Activity Report</div>
    <table style="border-collapse:collapse;width:100%;margin-top:16px" border="1" cellpadding="6">
      <tr><td style="width:36%">Category of the Activity:</td><td>${o.category}</td></tr>
      <tr><td>Title of the Activity</td><td>${o.title}</td></tr>
      <tr><td>Coordinator</td><td>${o.coordinator}</td></tr>
      <tr><td>Date of Activity</td><td>${o.date} Time: ${o.time}</td></tr>
      <tr><td>No. of Students Involved:</td><td>Male: ${o.male} &nbsp;&nbsp; Female: ${o.female} &nbsp;&nbsp; Total: ${o.total}</td></tr>
      <tr><td>Association/Collaboration</td><td>${o.association}</td></tr>
      <tr><td>Details of Invited Speaker</td><td>${o.speaker}</td></tr>
    </table>
    <table style="border-collapse:collapse;width:100%;margin-top:22px" border="1" cellpadding="6">
      <tr><td style="width:26%;font-weight:bold">Brief about an Activity</td><td>${o.brief}</td></tr>
      <tr><td style="font-weight:bold">Objectives</td><td>${o.objectives}</td></tr>
      <tr><td style="font-weight:bold">Outcomes</td><td>${o.outcomes}</td></tr>
    </table>
    <table style="border-collapse:collapse;width:100%;margin-top:22px;text-align:center" border="1" cellpadding="6">
      <tr style="font-weight:bold"><td>Faculty Coordinator</td><td>HoD/ Committee Incharge</td><td>IQAC Coordinator</td><td>Principal</td></tr>
      <tr style="height:140px"><td></td><td></td><td></td><td></td></tr>
    </table>`, "font-family:'Times New Roman';font-size:25px;padding:70px 90px;line-height:1.3");
}

function attendance(date: string, topic: string, rows: [string, string][]) {
  return page(1275, 1650, `${head}
    <div style="text-align:right">Date:- ${date}</div>
    <div style="text-align:center;font-weight:bold;text-decoration:underline;margin:8px 0">Attendance Sheet</div>
    <div>Topic- ${topic}</div>
    <table style="border-collapse:collapse;width:100%;margin-top:12px;font-size:21px" border="1" cellpadding="4">
      <tr style="font-weight:bold"><td style="width:10%">Sr. No.</td><td>Name of Student</td><td style="width:16%">Gender</td><td style="width:18%">Student Sign</td></tr>
      ${rows.map(([name, g], i) => `<tr><td>${i + 1}</td><td>${name}</td><td>${g}</td><td>signed</td></tr>`).join("")}
    </table>`, "font-family:Arial;font-size:23px;padding:50px 90px");
}

function photo(caption: string, people: number, tint: string) {
  return page(1200, 800, `
    <div style="position:absolute;inset:0;background:linear-gradient(160deg,${tint},#f1f5f9)"></div>
    <div style="position:absolute;left:90px;top:90px;width:1020px;height:200px;background:#cbd5e1;border:3px solid #94a3b8;border-radius:8px"></div>
    ${Array.from({ length: people }, (_, i) => `<div style="position:absolute;left:${120 + (i % 9) * 112}px;top:${330 + Math.floor(i / 9) * 140}px;width:62px;height:62px;border-radius:50%;background:#64748b"></div><div style="position:absolute;left:${108 + (i % 9) * 112}px;top:${394 + Math.floor(i / 9) * 140}px;width:86px;height:56px;background:#475569;border-radius:12px 12px 0 0"></div>`).join("")}
    <div style="position:absolute;left:0;right:0;bottom:70px;text-align:center;font:bold 30px Arial;color:#334155">Illustration standing in for an event photograph — ${caption}</div>`);
}

const FIRST = ["Aditya", "Bhavna", "Chirag", "Deepa", "Eknath", "Fatima", "Gopal", "Harsha", "Ishaan", "Jyoti", "Kiran", "Lalit", "Meera", "Nikhil", "Omkar", "Pooja", "Rahul", "Sneha", "Tanmay", "Usha", "Varun", "Waman", "Yash", "Zoya", "Anil", "Bharat", "Chetna", "Dinesh", "Esha", "Farooq"];
const FEMALE = new Set(["Bhavna", "Deepa", "Fatima", "Harsha", "Jyoti", "Meera", "Pooja", "Sneha", "Usha", "Zoya", "Chetna", "Esha"]);
const roster = (n: number, offset = 0): [string, string][] =>
  Array.from({ length: n }, (_, i) => {
    const f = FIRST[(i + offset) % FIRST.length];
    return [`Test Learner ${f}`, FEMALE.has(f) ? "Female" : "Male"];
  });

async function textPdf(file: string, lines: [string, number, boolean?, number?, number?][]) {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.TimesRoman);
  const bold = await d.embedFont(StandardFonts.TimesRomanBold);
  const p = d.addPage([595, 842]);
  for (const [t, y, b, size, x] of lines) p.drawText(t, { x: x ?? 60, y, size: size ?? 12, font: b ? bold : font });
  p.drawText("TEST DATA — SYNTHETIC", { x: 420, y: 40, size: 10, font: bold });
  writeFileSync(file, await d.save());
}

async function imagePdf(file: string, png: Buffer) {
  const d = await PDFDocument.create();
  const img = await d.embedPng(png);
  d.addPage([612, 792]).drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  writeFileSync(file, await d.save());
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  const shot = async (html: string, w: number, h: number, type: "png" | "jpeg" = "png") => {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<body style="margin:0">${html}</body>`);
    const b = await p.screenshot({ type, quality: type === "jpeg" ? 85 : undefined });
    await p.close();
    return b;
  };

  // ---------------- A. Guest lecture (complete; conflict + count mismatch)
  const A = path.join(ROOT, "A-guest-lecture-EV-batteries");
  mkdirSync(A, { recursive: true });
  writeFileSync(path.join(A, "1-poster.png"), await shot(page(1600, 900, `
    <div style="position:absolute;inset:0;background:#eef6ff"></div>
    <div style="position:relative;text-align:center;padding-top:40px;font-family:Arial">
      <div style="font:bold 42px Arial;color:#1d4ed8">${INST}</div>
      <div style="font:bold 32px Arial;color:#0f766e;margin-top:14px">DEPARTMENT OF MECHANICAL ENGINEERING</div>
      <div style="font:bold 28px Arial;color:#0f766e">IN COLLABORATION WITH SAMPLE EV STUDENT CLUB</div>
      <div style="font:30px Arial;margin-top:28px">organizes</div>
      <div style="font:bold 64px Georgia;color:#9a3412;margin-top:6px">GUEST LECTURE ON EV BATTERY<br>THERMAL MANAGEMENT</div>
      <div style="font:bold 36px Arial;color:#1e3a8a;margin-top:22px">20TH JANUARY, 2027 · 2.30 PM</div>
      <div style="font:28px Arial;margin-top:10px">Seminar Hall C-04</div>
    </div>`), 1600, 900));
  await textPdf(path.join(A, "2-notice.pdf"), [
    ["DEPARTMENT OF MECHANICAL ENGINEERING", 790, true, 15, 150],
    [INST, 770, true, 13, 175],
    ["Ref. No.: SIT/MECH/2026-27/041", 730],
    ["Date:- 15/01/2027", 730, false, 12, 430],
    ["NOTICE", 690, true, 13, 270],
    ["All the students of Third Year Mechanical Engineering are hereby informed that a", 650],
    ["“Guest Lecture on EV Battery Thermal Management” has been organized on 21st January", 632],
    ["2027 (rescheduled from 20th January). You are instructed to remain present at 2.30 pm", 614],
    ["in Seminar Hall C-04 for the same.", 596],
    ["Test Coordinator P", 520],
    ["Co-ordinator", 502],
  ]);
  await imagePdf(path.join(A, "3-activity-report-SCANNED.pdf"), await shot(activityReport({
    session: "2026-27", category: "Guest Lecture", title: "Guest Lecture on EV Battery Thermal Management",
    coordinator: "Test Coordinator P, Test Coordinator Q", date: "21/01/2027", time: "02.30 pm",
    male: 22, female: 9, total: 31, association: "Sample EV Student Club",
    speaker: "Test Speaker R, Senior Battery Engineer, Sample Motors Pvt. Ltd.",
    brief: "An invited industry engineer explained how lithium-ion battery packs are cooled in electric vehicles and why cell temperature limits matter.",
    objectives: "To introduce students to battery thermal management and the trade-offs between air and liquid cooling.",
    outcomes: "Students compared air and liquid cooling layouts and listed the temperature limits that drive pack design.",
  }), 1275, 1650));
  await textPdf(path.join(A, "4-detailed-report.pdf"), [
    ["DEPARTMENT OF MECHANICAL ENGINEERING", 790, true, 15, 150],
    [INST, 770, true, 13, 175],
    ["Date:- 23/01/2027", 730, false, 12, 430],
    ["REPORT", 690, true, 13, 265],
    ["The Department of Mechanical Engineering organized a Guest Lecture on EV Battery Thermal", 650],
    ["Management on 21st January 2027 at 2.30 pm in Seminar Hall C-04, in collaboration with the", 632],
    ["Sample EV Student Club. The session was delivered by Test Speaker R, Senior Battery Engineer.", 614],
    ["The speaker described the heat generated by battery cells during fast charging and showed", 590],
    ["how cooling plates and coolant loops keep cells within a safe temperature band. Students", 572],
    ["asked about cooling in two-wheelers and about battery life in hot climates.", 554],
    ["Impact Analysis", 520, true],
    ["Students related classroom heat-transfer topics to a real product and two student groups", 496],
    ["proposed final-year projects on battery cooling.", 478],
    ["Test Coordinator P", 400],
    ["Co-ordinator", 382],
  ]);
  // 30 rows on the sheet, but the report states Total: 31 -> the app must flag the mismatch
  writeFileSync(path.join(A, "5-attendance-sheet.png"), await shot(attendance("21/01/2027", "“Guest Lecture on EV Battery Thermal Management” on 21st January 2027.", roster(30)), 1275, 1650));
  writeFileSync(path.join(A, "6-photo.jpg"), await shot(photo("guest lecture", 18, "#dbeafe"), 1200, 800, "jpeg"));

  // ---------------- B. Industrial visit (incomplete packet)
  const B = path.join(ROOT, "B-industrial-visit-INCOMPLETE");
  mkdirSync(B, { recursive: true });
  const bReport = await shot(activityReport({
    session: "2026-27", category: "Industrial Visit", title: "Industrial Visit to Sample Castings Foundry",
    coordinator: "Test Coordinator S", date: "04/02/2027", time: "09.00 am",
    male: 17, female: 6, total: 23, association: "------", speaker: "------",
    brief: "Students visited a sand-casting foundry and followed one casting from pattern making to fettling and inspection.",
    objectives: "To show students the full sand-casting process and the quality checks used on the shop floor.",
    outcomes: "Students identified common casting defects and the inspection step at which each one is found.",
  }), 1275, 1650);
  await imagePdf(path.join(B, "1-activity-report.pdf"), bReport);
  writeFileSync(path.join(B, "2-photo.jpg"), await shot(photo("industrial visit", 12, "#fef3c7"), 1200, 800, "jpeg"));

  // ---------------- C. Hackathon (upload with the WRONG type on purpose)
  const C = path.join(ROOT, "C-hackathon-WRONG-TYPES");
  mkdirSync(C, { recursive: true });
  await textPdf(path.join(C, "1-notice__upload-as-POSTER.pdf"), [
    ["DEPARTMENT OF MECHANICAL ENGINEERING", 790, true, 15, 150],
    [INST, 770, true, 13, 175],
    ["Date:- 01/03/2027", 730, false, 12, 430],
    ["NOTICE", 690, true, 13, 270],
    ["All the students of Second Year Mechanical Engineering are hereby informed that a", 650],
    ["“CAD Modelling Hackathon” has been organized on 8th March 2027. Teams of three must", 632],
    ["report at 10.00 am in CAD Lab 2 for the same.", 614],
    ["Test Coordinator T", 520],
    ["Co-ordinator", 502],
  ]);
  writeFileSync(path.join(C, "2-attendance-sheet__upload-as-SUPPORTING.png"), await shot(attendance("08/03/2027", "“CAD Modelling Hackathon” on 8th March 2027.", roster(12, 7)), 1275, 1650));

  await browser.close();
  console.log("wrote test packets to", ROOT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
