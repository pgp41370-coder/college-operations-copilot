/**
 * Records the live product demo for the product video on the DEPLOYED app.
 *
 *   npx tsx scripts/demo/make-demo-docs.mts   # once: synthetic documents
 *   npx tsx scripts/video/record-product.mts  # asks for an admin login
 *
 * The admin credentials are typed into a hidden prompt, kept in memory and
 * never printed, saved or shown on camera. Off camera, the admin session only
 * creates a temporary faculty account ("Demo Faculty (synthetic)", random
 * password, `.invalid` address); everything on camera is done as that
 * account with synthetic documents. Afterwards the demo activity is archived
 * and the account is deactivated. Pilot metrics exclude `.invalid` accounts.
 *
 * Output (git-ignored): .cache/video/raw/ — screencast frames with timestamps,
 * markers, element positions for callouts, and a still of the Pilot page.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { hiddenPrompt, prompt } from "../lib/prompt";

const BASE = (process.argv.find((a) => a.startsWith("--base-url="))?.split("=")[1] ?? "https://college-operations-copilot.vercel.app").replace(/\/$/, "");
const ROOT = process.cwd();
const IN = path.join(ROOT, "demo", "input");
const RAW = path.join(ROOT, ".cache", "video", "raw");
const FRAMES = path.join(RAW, "frames");
const W = 1920;
const H = 1080;

const CURSOR_JS = String.raw`(() => {
  const w = window;
  const install = () => {
    if (!document.body || document.getElementById("__v_cursor")) return;
    const style = document.createElement("style");
    style.id = "__v_style";
    style.textContent = [
      "#__v_cursor{position:fixed;left:0;top:0;z-index:2147483647;width:24px;height:24px;pointer-events:none;transition:transform 40ms linear;background:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><path d='M3 2 L3 19 L8 14.5 L11.2 21.5 L14 20.3 L10.9 13.4 L17.5 13.4 Z' fill='%23111827' stroke='white' stroke-width='1.6' stroke-linejoin='round'/></svg>\") no-repeat}",
      ".__v_ripple{position:fixed;z-index:2147483646;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2.5px solid #4f46e5;pointer-events:none;animation:__vr .55s ease-out forwards}",
      "@keyframes __vr{from{transform:scale(.3);opacity:.9}to{transform:scale(1.5);opacity:0}}"
    ].join("\n");
    document.head.appendChild(style);
    const c = document.createElement("div");
    c.id = "__v_cursor";
    if (w.__vPos) c.style.transform = "translate(" + w.__vPos[0] + "px," + w.__vPos[1] + "px)";
    document.body.appendChild(c);
  };
  if (!w.__vListeners) {
    w.__vListeners = true;
    document.addEventListener("mousemove", (e) => {
      w.__vPos = [e.clientX, e.clientY];
      const cur = document.getElementById("__v_cursor");
      if (cur) cur.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
    }, true);
    document.addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.className = "__v_ripple";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 600);
    }, true);
  }
  setInterval(install, 250);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();`;

type Box = { x: number; y: number; w: number; h: number };
const frames: { file: string; t: number }[] = [];
const markers: { name: string; t: number; boxes: Record<string, Box> }[] = [];
let page: Page;

const now = () => Date.now() / 1000;
const hold = (ms: number) => page.waitForTimeout(ms);

async function boxOf(loc: Locator): Promise<Box | null> {
  const b = await loc.boundingBox().catch(() => null);
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
}
/** Records a named moment and the on-screen position of elements for callouts. */
async function mark(name: string, els: Record<string, Locator> = {}) {
  const boxes: Record<string, Box> = {};
  for (const [k, l] of Object.entries(els)) {
    const b = await boxOf(l.first());
    if (b) boxes[k] = b;
  }
  markers.push({ name, t: now(), boxes });
  console.log(`  · ${name}`);
}
async function moveTo(loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 22 });
}
async function click(loc: Locator, pause = 600) {
  await moveTo(loc);
  await hold(280);
  await loc.click();
  await hold(pause);
}
async function type(loc: Locator, text: string, delay = 55) {
  await click(loc, 150);
  await loc.pressSequentially(text, { delay });
}
async function scrollTo(loc: Locator, offset = 160) {
  const target = await loc.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), target);
  await hold(900);
}
async function scrollTop() {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await hold(800);
}
async function upload(kind: string, file: string, done: RegExp) {
  await click(page.getByLabel("Document type"), 200);
  await page.getByLabel("Document type").selectOption({ label: kind });
  await hold(300);
  await page.locator('input[type="file"]').setInputFiles(path.join(IN, file));
  const job = page.getByTestId("upload-job").filter({ hasText: file }).first();
  await job.filter({ hasText: done }).waitFor({ timeout: 240_000 });
  if (await page.locator("[data-testid=upload-job].border-danger-line", { hasText: file }).count()) throw new Error(`upload failed: ${file}`);
}
async function apiAs(ctx: BrowserContext, method: "POST" | "PATCH", url: string, data: unknown) {
  const res = await ctx.request.fetch(`${BASE}${url}`, { method, data, headers: { origin: BASE, "content-type": "application/json" } });
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()}`);
  return res.json();
}
async function signIn(p: Page, email: string, password: string) {
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password").fill(password);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

async function main() {
  for (const f of ["demo-notice.pdf", "demo-activity-report-scan.pdf", "demo-poster.png", "demo-attendance-sheet.png", "demo-event-photo.jpg"]) {
    if (!existsSync(path.join(IN, f))) throw new Error(`Missing ${f}. Run: npx tsx scripts/demo/make-demo-docs.mts`);
  }
  console.log(`Product video recording against ${BASE}`);
  console.log("Use an ADMIN account. It is used off camera only, to create and later deactivate a temporary demo account.\n");
  // Local rehearsal only: a local build may take test credentials from the environment.
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
  const adminEmail = local && process.env.VIDEO_ADMIN_EMAIL ? process.env.VIDEO_ADMIN_EMAIL : await prompt("Admin email: ");
  const adminPassword = local && process.env.VIDEO_ADMIN_PASSWORD ? process.env.VIDEO_ADMIN_PASSWORD : await hiddenPrompt("Admin password (hidden): ");

  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  const demoEmail = `demo.faculty.${randomBytes(3).toString("hex")}@demo-video.invalid`;
  const demoPassword = randomBytes(15).toString("base64url"); // memory only
  let browser: Browser | undefined;
  let admin: BrowserContext | undefined;
  let demoUserId: string | null = null;
  let activityUrl = "";
  try {
    browser = await chromium.launch();
    // ---- off camera: admin creates the temporary demo account
    admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ap = await admin.newPage();
    await signIn(ap, adminEmail, adminPassword);
    const created = await apiAs(admin, "POST", "/api/admin/users", { name: "Demo Faculty (synthetic)", email: demoEmail, role: "faculty", password: demoPassword });
    demoUserId = created.id ?? null;
    console.log("Temporary demo account created (off camera).");

    // ---- on camera
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: true });
    await ctx.addInitScript(CURSOR_JS);
    page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    let n = 0;
    cdp.on("Page.screencastFrame", async (f) => {
      const file = `f${String(n++).padStart(6, "0")}.jpg`;
      writeFileSync(path.join(FRAMES, file), Buffer.from(f.data, "base64"));
      frames.push({ file, t: f.metadata.timestamp ?? now() });
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await page.goto(`${BASE}/login`);
    await page.mouse.move(W / 2, H / 2);
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    await hold(1200);

    await mark("login", { form: page.locator("form") });
    await type(page.getByLabel("Email"), demoEmail, 40);
    await type(page.getByLabel("Password"), demoPassword, 30);
    await click(page.getByRole("button", { name: "Sign in" }), 0);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await hold(1500);
    await mark("dashboard", { kpis: page.locator("main .grid").first(), env: page.getByText("Production", { exact: true }) });
    await hold(2500);

    await click(page.getByRole("link", { name: "Create Activity", exact: true }).first(), 1200);
    await mark("create", { stepper: page.getByRole("list", { name: "Workflow progress" }) });
    await hold(1500);
    await click(page.getByRole("button", { name: /Create and continue/ }), 0);
    await page.waitForURL(/tab=evidence/, { timeout: 30_000 });
    activityUrl = page.url().split("?")[0];
    await hold(1200);

    await mark("upload", { dropzone: page.getByText("Upload evidence", { exact: true }) });
    await upload("Notice", "demo-notice.pdf", /Extracted 1 page/);
    await mark("upload-ocr");
    await upload("Existing activity report", "demo-activity-report-scan.pdf", /Extracted 1 page/);
    await upload("Poster", "demo-poster.png", /Extracted 1 page/);
    await upload("Attendance sheet", "demo-attendance-sheet.png", /attendance rows drafted/);
    await upload("Photograph", "demo-event-photo.jpg", /stored as evidence/);
    await scrollTo(page.getByTestId("upload-job").first(), 120);
    await mark("upload-done", { jobs: page.locator("section[aria-label='Upload progress']") });
    await hold(2500);
    await scrollTop();

    await click(page.getByRole("tab", { name: "Overview" }), 1200);
    await mark("overview", { trust: page.getByText("Trust summary").locator("xpath=ancestor::div[contains(@class,'card')][1]") });
    await hold(3000);

    await click(page.getByRole("tab", { name: /^Review/ }), 1200);
    const category = page.getByTestId("field-category");
    await scrollTo(category, 220);
    await mark("review", { field: category, source: category.getByRole("link").first() });
    await moveTo(category.getByRole("link").first());
    await hold(2200);
    await click(category.getByRole("button", { name: "Preview source" }), 2500);
    await mark("preview", { panel: page.getByRole("dialog") });
    await hold(3500);
    await page.keyboard.press("Escape");
    await hold(800);

    const date = page.getByTestId("field-activity_date");
    await scrollTo(date, 120);
    const cands = date.getByTestId("candidate");
    await mark("conflict", {
      card: date,
      banner: date.getByText(/Documents contain different values/),
      poster: cands.filter({ hasText: "demo-poster.png" }),
      notice: cands.filter({ hasText: "demo-notice.pdf" }),
      report: cands.filter({ hasText: "demo-activity-report-scan.pdf" }),
    });
    await moveTo(cands.filter({ hasText: "demo-poster.png" }).first());
    await hold(2500);
    await moveTo(cands.filter({ hasText: "demo-notice.pdf" }).first());
    await hold(2500);
    const choice = cands.filter({ hasText: "06/11/2026" }).filter({ hasText: "demo-activity-report-scan.pdf" }).first();
    await moveTo(choice);
    await hold(1500);
    await mark("choose", { button: choice.getByRole("button", { name: "Use this value" }) });
    await click(choice.getByRole("button", { name: "Use this value" }), 1500);
    await date.getByText(/Selected by reviewer/).waitFor({ timeout: 30_000 });
    await mark("chosen", { card: date });
    await hold(2500);
    const confirm = page.getByRole("button", { name: "Confirm", exact: true });
    for (let i = 0; i < 20 && (await confirm.count()); i++) await click(confirm.first(), 900);
    await scrollTop();

    await click(page.getByRole("tab", { name: /^Attendance/ }), 1500);
    await mark("attendance", {
      stats: page.getByText("Stated total").locator("xpath=ancestor::div[contains(@class,'grid')][1]"),
      recon: page.getByText("Participant reconciliation").locator("xpath=ancestor::div[contains(@class,'card')][1]"),
    });
    await hold(3000);
    const rows = page.getByTestId("attendance-row");
    await scrollTo(rows.first(), 260);
    await mark("attendance-rows", { rows: page.locator("table").last(), status: rows.first().getByText("Needs verification") });
    await hold(2500);
    const add = page.getByTestId("new-attendance-row");
    await scrollTo(add, 520);
    await type(add.getByPlaceholder("#"), "8");
    await type(add.getByPlaceholder("Name as written on the sheet"), "Demo Student Harsh", 50);
    await add.locator("select").selectOption({ label: "Male" });
    await hold(400);
    await click(add.getByRole("button", { name: "Add row" }), 1500);
    await rows.filter({ has: page.locator("input[value='Demo Student Harsh']") }).waitFor({ timeout: 30_000 });
    await scrollTop();
    await click(page.getByRole("button", { name: "Mark all rows verified" }), 900);
    await mark("verify-confirm", { dialog: page.getByRole("dialog") });
    await hold(1500);
    await click(page.getByRole("dialog").getByRole("button", { name: "Confirm" }), 1500);
    await page.getByText("Reconciled", { exact: true }).first().waitFor({ timeout: 30_000 });
    await scrollTop();
    await mark("reconciled", {
      recon: page.getByText("Participant reconciliation").locator("xpath=ancestor::div[contains(@class,'card')][1]"),
      badge: page.getByText("Reconciled", { exact: true }).first(),
    });
    await hold(3000);

    await click(page.getByRole("tab", { name: "Reports" }), 1200);
    await mark("reports");
    await click(page.getByRole("button", { name: /Generate reports/ }).first(), 0);
    await page.locator(".paper").waitFor({ timeout: 60_000 });
    await hold(1200);
    await mark("generated", { cards: page.getByText("Activity Report", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'grid')][1]") });
    await hold(1500);
    await scrollTo(page.locator(".paper"), 120);
    await mark("paper", { paper: page.locator(".paper"), details: page.getByText("Document details") });
    await hold(3500);
    await scrollTop();

    await click(page.getByRole("tab", { name: "Approve" }), 1500);
    await mark("approve", { checklist: page.getByText("Approval readiness").locator("xpath=ancestor::div[contains(@class,'card')][1]"), button: page.getByRole("button", { name: "Approve", exact: true }) });
    await hold(2500);
    await click(page.getByRole("button", { name: "Approve", exact: true }), 0);
    await page.getByText("This activity is approved and read-only.").waitFor({ timeout: 30_000 });
    await hold(800);
    await mark("approved", { header: page.getByText(/Approved by Demo Faculty/).first() });
    await hold(2500);

    await click(page.getByRole("tab", { name: "Reports" }), 1200);
    await mark("exports", { cards: page.getByText("Activity Report", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'grid')][1]") });
    for (const n of ["Activity Report (.docx)", "Activity Report (.pdf)", "Detailed Report (.pdf)"]) {
      const [d] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), click(page.getByRole("link", { name: n }), 500)]);
      await d.path();
    }
    const [pk] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), click(page.getByRole("button", { name: "Compiled activity packet (.pdf)" }), 500)]);
    await pk.path();
    await hold(1500);

    await click(page.getByRole("tab", { name: "Audit" }), 1500);
    await mark("audit", { timeline: page.getByText("Audit timeline").locator("xpath=ancestor::div[contains(@class,'card')][1]") });
    await hold(2000);
    await page.mouse.wheel(0, 500);
    await hold(2000);
    await scrollTop();

    await click(page.getByRole("tab", { name: "Approve" }), 1500);
    const fb = page.getByTestId("feedback-card");
    await mark("feedback", { card: fb });
    await hold(1500);
    await click(fb.locator("label", { has: page.getByLabel("4 out of 5") }), 500);
    await type(fb.getByLabel("What worked well?"), "Seeing the source page next to each value.", 30);
    await type(fb.getByLabel("What was difficult?"), "Checking handwritten names against the sheet.", 30);
    await click(fb.getByText("Minor corrections", { exact: true }), 400);
    await click(fb.getByText("Some", { exact: true }), 400);
    await click(fb.getByText("Yes", { exact: true }), 600);
    await mark("feedback-filled", { card: fb });
    await click(fb.getByRole("button", { name: "Submit feedback" }), 0);
    await fb.getByText(/your feedback was recorded/).waitFor({ timeout: 30_000 });
    await mark("feedback-saved", { card: fb });
    await hold(2500);
    await cdp.send("Page.stopScreencast");
    await mark("end");
    await ctx.close();

    // ---- administrator's Pilot page: a still of the metrics only
    await ap.goto(`${BASE}/pilot`);
    await ap.getByRole("heading", { name: "Pilot" }).waitFor();
    await ap.setViewportSize({ width: W, height: H });
    const metrics = ap.locator("main .grid").first();
    await metrics.screenshot({ path: path.join(RAW, "pilot-metrics.png") });
    console.log("Pilot metrics still saved (metrics only; no names or comments).");
  } finally {
    // ---- clean-up, off camera
    if (admin) {
      if (activityUrl) {
        const id = activityUrl.split("/").pop();
        await apiAs(admin, "POST", `/api/activities/${id}/workflow`, { action: "archive" }).then(() => console.log("Demo activity archived."), (e) => console.log(`Archive failed: ${e.message}`));
      }
      if (demoUserId) {
        await apiAs(admin, "PATCH", `/api/admin/users/${demoUserId}`, { isActive: false }).then(() => console.log("Temporary demo account deactivated."), (e) => console.log(`Deactivate failed: ${e.message}`));
      }
    }
    await browser?.close();
    writeFileSync(path.join(RAW, "frames.json"), JSON.stringify(frames));
    writeFileSync(path.join(RAW, "markers.json"), JSON.stringify(markers, null, 1));
  }
  console.log(`\nRecorded ${frames.length} frames, ${markers.length} markers → .cache/video/raw/`);
}

main().catch((e) => {
  console.error(`\nRecording failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
