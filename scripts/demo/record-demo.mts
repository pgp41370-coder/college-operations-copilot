/**
 * Records a narrated demo video of the full workflow on a LOCAL production
 * build with a fresh local database and SYNTHETIC documents.
 *
 *   npm run build && npx tsx scripts/demo/make-demo-docs.mts && npx tsx scripts/demo/record-demo.mts
 *
 * Output: demo/College_Operations_Copilot_Demo.mp4 (H.264 + AAC) and .webm (VP9 + Opus)
 * with a spoken voice-over, plus demo/output/* (every generated file).
 *
 * Requires macOS `say` (built in) and ffmpeg (`brew install ffmpeg`).
 * Voice and speed: DEMO_VOICE (default "Samantha"; e.g. "Rishi" or "Tara" for
 * Indian English) and DEMO_RATE (words per minute, default 182).
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";
import JSZip from "jszip";
import postgres from "postgres";
import { migrate } from "../migrate";
import { createUser } from "../../src/lib/server/users";

const ROOT = process.cwd();
const IN = path.join(ROOT, "demo", "input");
const OUT = path.join(ROOT, "demo", "output");
const VIDEO_DIR = path.join(ROOT, "demo", ".video-tmp");
const PORT = 3400;
const BASE = `http://localhost:${PORT}`;
const DB = "college_ops_demo";
const LOCAL_URL = `postgres://${os.userInfo().username}@localhost:5432/${DB}`;
const W = 1440;
const H = 900;

const CLEAN_ENV = { ...process.env, DATABASE_URL: LOCAL_URL, DATABASE_URL_UNPOOLED: "", PGUSER: "", PGPASSWORD: "", PGHOST: "", PGDATABASE: "" };

async function setupDatabase(): Promise<{ email: string; password: string }> {
  const admin = postgres(`postgres://${os.userInfo().username}@localhost:5432/postgres`, { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${DB} with (force)`);
  await admin.unsafe(`create database ${DB}`);
  await admin.end();
  await migrate(LOCAL_URL, () => {});
  const sql = postgres(LOCAL_URL, { max: 1, onnotice: () => {} });
  // Demo database only: use a copy of the template with a synthetic institution
  // and letterhead, so no generated document carries a real institution's name.
  const [tpl] = await sql<{ id: string; definition: { institution: { name: string }; detailedReport: { letterheadLines: string[] } } }[]>`
    select id, definition from templates where is_active limit 1`;
  const def = tpl.definition;
  def.institution.name = "Demo Institute of Engineering (synthetic)";
  def.detailedReport.letterheadLines = [
    "DEPARTMENT OF MECHANICAL ENGINEERING",
    "DEMO INSTITUTE OF ENGINEERING",
    "Demo Campus Road, Demo City",
    "DEMO DATA — SYNTHETIC",
  ];
  await sql`update templates set definition = ${sql.json(def as never)}, name = 'Demo template (synthetic institution)',
            derived_from = 'KDK Mechanical template with demo letterhead' where id = ${tpl.id}`;
  const email = "demo.faculty@demo.test";
  const password = randomBytes(12).toString("base64url"); // local demo only, never printed
  await createUser(sql, null, { email, name: "Demo Faculty (synthetic)", role: "faculty", password });
  await sql.end();
  return { email, password };
}

async function startServer(): Promise<ChildProcess> {
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], { env: CLEAN_ENV, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error("server did not start");
}

// Caption bar, visible cursor and click ripple, re-installed on every page.
// Plain JavaScript source (not a TS function): tsx/esbuild would inject helpers
// such as __name() into a serialized function, which do not exist in the page.
const OVERLAY_JS = String.raw`(() => {
  const w = window;
  const install = () => {
    if (!document.body || document.getElementById("__demo_cursor")) return;
    for (const id of ["__demo_caption", "__demo_badge", "__demo_style"]) document.getElementById(id)?.remove();
    const style = document.createElement("style");
    style.id = "__demo_style";
    style.textContent = [
      "#__demo_cursor{position:fixed;left:0;top:0;z-index:2147483647;width:22px;height:22px;pointer-events:none;background:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><path d='M2 2 L2 18 L7 13 L10 20 L13 19 L10 12 L17 12 Z' fill='black' stroke='white' stroke-width='1.5'/></svg>\") no-repeat}",
      ".__demo_ripple{position:fixed;z-index:2147483646;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid #1f4e8c;pointer-events:none;animation:__r .6s ease-out forwards}",
      "@keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}",
      "#__demo_caption{position:fixed;z-index:2147483645;left:50%;bottom:22px;transform:translateX(-50%);max-width:1100px;padding:12px 22px;border-radius:10px;background:rgba(17,24,39,.92);color:#fff;font:600 18px/1.4 Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:none;text-align:center}",
      "#__demo_caption:empty{display:none}",
      "#__demo_badge{position:fixed;z-index:2147483645;right:14px;top:36px;padding:4px 10px;border-radius:6px;background:#b42318;color:#fff;font:700 12px Arial;pointer-events:none}"
    ].join("\n");
    document.head.appendChild(style);
    const c = document.createElement("div");
    c.id = "__demo_cursor";
    if (w.__demoPos) c.style.transform = "translate(" + w.__demoPos[0] + "px," + w.__demoPos[1] + "px)";
    document.body.appendChild(c);
    const cap = document.createElement("div");
    cap.id = "__demo_caption";
    let saved = "";
    try { saved = sessionStorage.getItem("__demo_caption") || ""; } catch (e) {}
    cap.textContent = saved;
    document.body.appendChild(cap);
    const badge = document.createElement("div");
    badge.id = "__demo_badge";
    badge.textContent = "DEMO · SYNTHETIC DATA";
    document.body.appendChild(badge);
  };
  if (!w.__demoListeners) {
    w.__demoListeners = true;
    document.addEventListener("mousemove", (e) => {
      w.__demoPos = [e.clientX, e.clientY];
      const cur = document.getElementById("__demo_cursor");
      if (cur) cur.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
    }, true);
    document.addEventListener("mousedown", (e) => {
      if (!document.body) return;
      const r = document.createElement("div");
      r.className = "__demo_ripple";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
  }
  w.__setCaption = (t) => {
    try { sessionStorage.setItem("__demo_caption", t); } catch (e) {}
    const cap = document.getElementById("__demo_caption");
    if (cap) cap.textContent = t;
  };
  setInterval(install, 300);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();`;

let page: Page;
const hold = (ms: number) => page.waitForTimeout(ms);

// ---------------------------------------------------------------- narration
// Voice-over generated offline with macOS `say` (free, local). Each line is
// timed against the recording so ffmpeg can place it exactly.
const VOICE = process.env.DEMO_VOICE ?? "Samantha";
const RATE = process.env.DEMO_RATE ?? "182";
const AUDIO_DIR = path.join(ROOT, "demo", ".audio");
let t0 = 0;
const narration: { file: string; startMs: number }[] = [];

function spoken(text: string): string {
  return text
    .replace(/→/g, " to ")
    .replace(/—/g, ", ")
    .replace(/\b31 Oct 2026\b/g, "31st October 2026")
    .replace(/\b6 Nov 2026\b/g, "6th November 2026")
    .replace(/\bOCR\b/g, "O.C.R.")
    .replace(/\bDOCX\b/g, "Word")
    .replace(/\bCSV\b/g, "C.S.V.")
    .replace(/\bJSON\b/g, "JSON")
    .replace(/\bPDF\b/g, "P.D.F.")
    .replace(/\bZIP\b/g, "zip")
    .replace(/\bHoD\b/g, "H.O.D.")
    .replace(/(\d+)%/g, "$1 percent")
    .replace(/\s+/g, " ")
    .trim();
}

function synth(text: string): { file: string; ms: number } {
  mkdirSync(AUDIO_DIR, { recursive: true });
  const say = spoken(text);
  const file = path.join(AUDIO_DIR, `${createHash("sha1").update(`${VOICE}|${RATE}|${say}`).digest("hex").slice(0, 16)}.aiff`);
  if (!existsSync(file)) execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", file, say]);
  const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return { file, ms: Math.round(Number(dur) * 1000) };
}

/** Starts a narration line now and waits at least until it has finished. */
async function speak(text: string, minMs = 0) {
  const { file, ms } = synth(text);
  narration.push({ file, startMs: Date.now() - t0 });
  await hold(Math.max(minMs, ms + 450));
}

async function caption(text: string, ms = 2600) {
  await page.evaluate((t) => (window as unknown as { __setCaption?: (t: string) => void }).__setCaption?.(t), text).catch(() => {});
  await speak(text, ms);
}
async function moveTo(loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
}
async function click(loc: Locator, pause = 500) {
  await moveTo(loc);
  await hold(250);
  await loc.click();
  await hold(pause);
}
async function type(loc: Locator, text: string) {
  await click(loc, 150);
  await loc.pressSequentially(text, { delay: 45 });
}
async function smoothScroll(px: number, steps = 24) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps);
    await hold(45);
  }
}
async function download(trigger: () => Promise<void>, name?: string) {
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), trigger()]);
  const file = path.join(OUT, name ?? d.suggestedFilename());
  await d.saveAs(file);
  return file;
}

function card(title: string, body: string) {
  return `<body style="margin:0;height:${H}px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f2649,#1f4e8c);font-family:Arial;color:#fff">
    <div style="max-width:1100px;padding:40px"><div style="font:700 50px Arial;letter-spacing:-1px">${title}</div>
    <div style="font:22px/1.55 Arial;margin-top:22px;color:#dbe6fb">${body}</div></div></body>`;
}

async function uploadDoc(kind: string, file: string, doneText: RegExp, note: string, captionText?: string) {
  await caption(note, 1600);
  const select = page.getByLabel("Document type");
  await moveTo(select);
  await select.selectOption({ label: kind });
  if (captionText) await type(page.getByLabel(/Caption/), captionText);
  await hold(400);
  await page.locator('input[type="file"]').setInputFiles(path.join(IN, file));
  await page.getByTestId("upload-job").filter({ hasText: file }).filter({ hasText: doneText }).first().waitFor({ timeout: 180_000 });
  await hold(1400);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  rmSync(VIDEO_DIR, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const creds = await setupDatabase();
  const server = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } },
    acceptDownloads: true,
    deviceScaleFactor: 1,
  });
  await context.addInitScript({ content: OVERLAY_JS });
  page = await context.newPage();
  t0 = Date.now();
  page.on("dialog", (d) => d.accept());
  try {
    // ---------------------------------------------------------------- intro
    await page.setContent(card("College Operations Copilot", "Activity Documentation Automation for colleges.<br><br>This demo runs the full workflow on <b>synthetic documents</b> (no real students, no real records): evidence upload → OCR & extraction with provenance → conflict detection → attendance reconciliation → report generation → faculty approval → exports."));
    await speak("College Operations Copilot. Activity documentation automation for colleges. This demo runs the full workflow on synthetic documents: evidence upload, text extraction with provenance, conflict detection, attendance reconciliation, report generation, faculty approval, and exports.", 5500);

    // ---------------------------------------------------------------- login
    await page.goto(`${BASE}/login`);
    await caption("Faculty sign in. Accounts are created by an administrator — there is no public sign-up.", 1200);
    await type(page.getByLabel("Email"), creds.email);
    await type(page.getByLabel("Password"), creds.password);
    await click(page.getByRole("button", { name: "Sign in" }));
    await page.waitForURL(/dashboard/);
    await caption("Dashboard: activities by status, recent changes, and a Create activity button.", 3200);

    // ---------------------------------------------------------------- create
    await click(page.getByRole("link", { name: "Create Activity", exact: true }).first());
    await caption("Step 1 — Create the activity. Every field is optional here and nothing is pre-filled.", 2400);
    await smoothScroll(700);
    await hold(800);
    await smoothScroll(-700);
    await caption("We leave the details blank so the system has to read them from the documents.", 2000);
    await click(page.getByRole("button", { name: /Create and continue/ }), 1200);
    await page.waitForURL(/tab=evidence/);

    // ---------------------------------------------------------------- evidence
    await caption("Step 2 — Upload evidence. Text is read inside the browser: PDF text layer first, OCR (Tesseract) for scans.", 3000);
    await uploadDoc("Poster", "demo-poster.png", /Extracted 1 page/, "Poster (image) → OCR in the browser…");
    await uploadDoc("Notice", "demo-notice.pdf", /Extracted 1 page/, "Notice (digital PDF) → read from its text layer…");
    await uploadDoc("Existing activity report", "demo-activity-report-scan.pdf", /Extracted 1 page/, "Scanned activity report (image-only PDF) → OCR…");
    await uploadDoc("Attendance sheet", "demo-attendance-sheet.png", /attendance rows drafted/, "Attendance sheet → OCR drafts rows for human verification…");
    await uploadDoc("Photograph", "demo-event-photo.jpg", /stored as evidence/, "Photograph → stored as evidence only. Nothing (date, place, people) is inferred from photos.", "Quiz in progress (illustration)");
    await smoothScroll(500);
    await caption("Every file is validated (type, size, duplicate hash), stored privately and never modified. Methods and OCR confidence are recorded.", 3600);
    await smoothScroll(-500);

    // ---------------------------------------------------------------- review
    await click(page.getByRole("tab", { name: /^Review/ }), 800);
    await caption("Step 3 — Review. Every value shows its source document, page, extraction rule and confidence.", 3400);
    await smoothScroll(300);
    await caption("Category, title, coordinator, counts… read from the scanned report by deterministic rules (no AI model).", 3000);
    const dateRow = page.getByTestId("field-activity_date");
    await moveTo(dateRow);
    await caption("CONFLICT: the poster prints 31 Oct 2026, while the notice, report and attendance sheet say 6 Nov 2026.", 3800);
    await caption("The system does not pick one. It shows each source with the exact snippet, and blocks approval until a person decides.", 3800);
    const choice = dateRow.getByTestId("candidate").filter({ hasText: "06/11/2026" }).filter({ hasText: "demo-activity-report-scan.pdf" }).first();
    await moveTo(choice);
    await hold(800);
    await click(choice.getByRole("button", { name: "Use this value" }), 1500);
    await caption("Resolved by the reviewer — the choice keeps its provenance and is written to the audit log.", 3000);
    const venue = page.getByTestId("field-venue");
    await moveTo(venue);
    await caption("Low-confidence values (below 80%) must be confirmed by a person before approval.", 2600);
    await click(venue.getByRole("button", { name: "Confirm" }), 1400);
    const hod = page.getByTestId("field-hod_name");
    await moveTo(hod);
    await caption("Signatory names are entered by faculty — never copied or invented.", 2200);
    await click(hod.getByRole("button", { name: "Edit" }));
    await type(hod.locator("input.input").first(), "Demo HoD (synthetic)");
    await click(hod.getByRole("button", { name: "Save" }), 1500);
    await caption("Manual entries are marked 'Entered by user' with editor and time.", 2400);
    const confirmBtn = page.getByRole("button", { name: "Confirm", exact: true });
    if (await confirmBtn.count()) {
      await caption("The reviewer checks each remaining low-confidence value against its source and confirms it.", 2400);
      while (await confirmBtn.count()) await click(confirmBtn.first(), 700);
    }

    // ---------------------------------------------------------------- attendance
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await hold(700);
    await click(page.getByRole("tab", { name: /^Attendance/ }), 800);
    await caption("Step 4 — Attendance. OCR drafted 7 rows; the report states 8 participants.", 3200);
    await caption("Participant-count mismatch detected — flagged, never silently corrected. Gender is taken only from the sheet, never from names.", 4200);
    await smoothScroll(420);
    await caption("The reviewer checks each row against the paper sheet and adds the participant missing from it.", 2600);
    const add = page.getByTestId("new-attendance-row");
    await type(add.getByPlaceholder("#"), "8");
    await type(add.getByPlaceholder("Name as written on the sheet"), "Demo Student Harsh");
    await add.locator("select").selectOption({ label: "Male" });
    await click(add.getByRole("button", { name: "Add row" }), 1500);
    await click(page.getByRole("button", { name: "Mark all rows verified" }), 900);
    await click(page.getByRole("dialog").getByRole("button", { name: "Confirm" }), 1500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await hold(900);
    await caption("Reconciliation now passes: 8 rows = 5 male + 3 female = stated total 8, all rows verified.", 3600);

    // ---------------------------------------------------------------- reports
    await click(page.getByRole("tab", { name: "Reports" }), 800);
    await caption("Step 5 — Generate reports from the reviewed fields using the institution's template.", 2400);
    await click(page.getByRole("button", { name: /Generate reports/ }), 800);
    await page.locator(".paper").waitFor();
    await caption("Activity Report — the structured table format. Signature spaces stay blank for physical signing.", 3000);
    await smoothScroll(1100, 40);
    await hold(1200);
    await smoothScroll(-1100, 30);
    await click(page.getByRole("radio", { name: "Detailed Report" }), 900);
    await caption("Detailed Report — the narrative is assembled only from existing fields, and the app says which ones.", 3200);
    await smoothScroll(900, 36);
    await hold(1000);
    await smoothScroll(-900, 30);
    await click(page.getByRole("radio", { name: "Attendance Summary" }), 900);
    await caption("Attendance Summary — stated vs recorded counts, reconciliation result and source documents.", 3000);
    await smoothScroll(500);
    await hold(800);
    await smoothScroll(-500);
    await caption("Exports: DOCX, PDF, CSV, a JSON provenance manifest, a compiled packet PDF and an evidence ZIP.", 2400);
    const dl = (name: string) => page.getByRole("link", { name });
    await download(() => click(dl("Activity Report (.docx)"), 300));
    await download(() => click(dl("Activity Report (.pdf)"), 300));
    await download(() => click(dl("Detailed Report (.docx)"), 300));
    await download(() => click(dl("Detailed Report (.pdf)"), 300));
    await download(() => click(dl("Attendance Summary (.pdf)"), 300));
    await download(() => click(dl("Attendance (.csv)"), 300));
    await download(() => click(dl("Provenance manifest (.json)"), 300));
    await download(() => click(page.getByRole("button", { name: "Compiled activity packet (.pdf)" }), 300));
    await download(() => click(page.getByRole("button", { name: "Evidence package (.zip)" }), 300));
    await caption("Draft exports carry a 'DRAFT — not yet approved' footer until a faculty member approves.", 2600);

    // ---------------------------------------------------------------- approve
    await click(page.getByRole("tab", { name: "Approve" }), 900);
    await caption("Step 6 — Approval. Only an authenticated person can approve, and only when no blocking issue remains.", 3200);
    await click(page.getByRole("button", { name: "Approve", exact: true }), 1500);
    await caption("Approved: approver and time are recorded and the activity becomes read-only.", 3000);
    await click(page.getByRole("tab", { name: "Reports" }), 600);
    await download(() => click(dl("Activity Report (.pdf)"), 300), "approved-activity-report.pdf");
    await download(() => click(dl("Activity Report (.docx)"), 300), "approved-activity-report.docx");
    await download(() => click(page.getByRole("button", { name: "Compiled activity packet (.pdf)" }), 300), "approved-activity-packet.pdf");
    await click(page.getByRole("tab", { name: "Audit" }), 900);
    await caption("Audit trail: every upload, extraction, decision, generation, export and approval — who and when.", 3600);
    await smoothScroll(600);
    await hold(1500);

    // ---------------------------------------------------------------- outputs
    await showOutputs();

    await page.setContent(card("What you just saw", `
      • Evidence read by in-browser OCR and deterministic rules — every value traceable to a page<br>
      • The 31 Oct vs 6 Nov conflict surfaced and resolved by a person, not by the software<br>
      • Attendance mismatch flagged, then reconciled by the reviewer<br>
      • Activity Report, Detailed Report, Attendance Summary, packet PDF, DOCX, CSV, manifest and ZIP<br>
      • Human-only approval with a complete audit trail<br><br>
      <span style="color:#fecaca">All documents in this video are synthetic demo data, recorded on a local build.</span>`));
    await speak("To recap: every value was traced to a source page, the date conflict and the attendance mismatch were surfaced and resolved by a person, and approval stayed with the faculty member, with a complete audit trail. All documents in this video are synthetic demo data.", 7000);
    await hold(1500);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    server.kill();
    if (video) {
      const silent = path.join(ROOT, "demo", "College_Operations_Copilot_Demo_silent.webm");
      renameSync(await video.path(), silent);
      muxNarration(silent);
    }
    rmSync(VIDEO_DIR, { recursive: true, force: true });
  }
}

/** Mixes every narration line at its recorded offset and muxes it with the video (MP4 + WebM). */
function muxNarration(silentVideo: string) {
  writeFileSync(path.join(ROOT, "demo", "narration.json"), JSON.stringify(narration, null, 2));
  const inputs = narration.flatMap((n) => ["-i", n.file]);
  const delays = narration.map((n, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${n.startMs}|${n.startMs}[a${i}]`);
  const mix = `${narration.map((_, i) => `[a${i}]`).join("")}amix=inputs=${narration.length}:normalize=0:dropout_transition=0,volume=1.6[aout]`;
  const graph = [...delays, mix].join(";");
  const mp4 = path.join(ROOT, "demo", "College_Operations_Copilot_Demo.mp4");
  const webm = path.join(ROOT, "demo", "College_Operations_Copilot_Demo.webm");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silentVideo, ...inputs, "-filter_complex", graph,
    "-map", "0:v", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", mp4]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1",
    "-c:a", "libopus", "-b:a", "96k", webm]);
  rmSync(silentVideo, { force: true });
  console.log(`narration lines: ${narration.length}; wrote ${path.relative(ROOT, mp4)} and ${path.relative(ROOT, webm)}`);
}

/** Shows the generated files in the video: rendered PDF pages, ZIP contents and manifest excerpt. */
async function showOutputs() {
  const shots = path.join(OUT, ".pages");
  mkdirSync(shots, { recursive: true });
  const pdfs = readdirSync(OUT).filter((f) => f.endsWith(".pdf"));
  const pick = (re: RegExp) => pdfs.find((f) => re.test(f));
  const sections: { title: string; file: string | undefined; pages?: number }[] = [
    { title: "Approved Activity Report (PDF)", file: pick(/^approved-activity-report\.pdf$/) },
    { title: "Detailed Report (PDF)", file: pick(/detailed-report.*\.pdf$/) },
    { title: "Attendance Summary (PDF)", file: pick(/attendance-summary.*\.pdf$/) },
    { title: "Compiled activity packet (PDF) — reports + evidence in template order", file: pick(/^approved-activity-packet\.pdf$/), pages: 8 },
  ];
  const imgs: string[] = [];
  for (const s of sections) {
    if (!s.file) continue;
    const prefix = path.join(shots, s.file.replace(/\W+/g, "_"));
    execFileSync("pdftoppm", ["-r", "70", "-png", "-l", String(s.pages ?? 2), path.join(OUT, s.file), prefix]);
    const files = readdirSync(shots).filter((f) => f.startsWith(path.basename(prefix))).sort();
    imgs.push(`<h2>${s.title}</h2><div class="row">${files.map((f) => `<img src="data:image/png;base64,${readFileSync(path.join(shots, f)).toString("base64")}">`).join("")}</div>`);
  }
  const zipFile = readdirSync(OUT).find((f) => f.endsWith(".zip"));
  const zip = zipFile ? await JSZip.loadAsync(readFileSync(path.join(OUT, zipFile))) : null;
  const zipList = zip ? Object.keys(zip.files).filter((f) => !f.endsWith("/")) : [];
  const manifestFile = readdirSync(OUT).find((f) => f.endsWith(".json"));
  const manifest = manifestFile ? JSON.parse(readFileSync(path.join(OUT, manifestFile), "utf8")) : null;
  const dateField = manifest?.fields?.find((f: { key: string }) => f.key === "activity_date");
  const allFiles = readdirSync(OUT).filter((f) => !f.startsWith("."));
  await page.setContent(`<body style="margin:0;background:#e5e7eb;font-family:Arial">
    <div style="padding:28px 40px 120px">
      <h1 style="margin:0 0 6px;font-size:30px">Generated outputs</h1>
      <div style="color:#374151;font-size:16px">${allFiles.length} files downloaded from the app: ${allFiles.join(" · ")}</div>
      ${imgs.join("")}
      <h2>Evidence package (ZIP) contents</h2><pre>${zipList.join("\n")}</pre>
      <h2>Provenance manifest — excerpt for “Date of Activity”</h2><pre>${JSON.stringify(dateField, null, 2)}</pre>
    </div>
    <style>h2{font-size:21px;margin:26px 0 10px;color:#1f4e8c} .row{display:flex;gap:14px;flex-wrap:wrap} img{height:560px;box-shadow:0 2px 10px rgba(0,0,0,.2);background:#fff}
    pre{background:#fff;padding:14px;border-radius:8px;font-size:15px;max-width:1300px;white-space:pre-wrap}</style></body>`);
  await caption("The generated documents themselves — rendered from the downloaded files.", 3000);
  const total = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < total - H + 200; y += 12) {
    await page.mouse.wheel(0, 12);
    await hold(28);
    if (y % 900 < 12) await hold(1200);
  }
  await caption("Every value in these documents can be traced back to a source page or to a named person's entry.", 3500);
  rmSync(shots, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
