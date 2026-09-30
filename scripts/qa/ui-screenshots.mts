/**
 * Visual QA: runs the full workflow on a LOCAL production build against a
 * fresh local database with SYNTHETIC documents only, and saves screenshots
 * (desktop and mobile) to .cache/ui-qa/ (git-ignored).
 *
 *   npm run build && npx tsx scripts/demo/make-demo-docs.mts && npx tsx scripts/qa/ui-screenshots.mts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import postgres from "postgres";
import { migrate } from "../migrate";
import { createUser } from "../../src/lib/server/users";

const ROOT = process.cwd();
const IN = path.join(ROOT, "demo", "input");
const OUT = path.join(ROOT, ".cache", "ui-qa");
const PORT = 3600;
const BASE = `http://localhost:${PORT}`;
const DB = "college_ops_qa";
const LOCAL_URL = `postgres://${os.userInfo().username}@localhost:5432/${DB}`;
const CLEAN_ENV = { ...process.env, DATABASE_URL: LOCAL_URL, DATABASE_URL_UNPOOLED: "", PGUSER: "", PGPASSWORD: "", PGHOST: "", PGDATABASE: "" };

async function setupDatabase() {
  const admin = postgres(`postgres://${os.userInfo().username}@localhost:5432/postgres`, { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${DB} with (force)`);
  await admin.unsafe(`create database ${DB}`);
  await admin.end();
  await migrate(LOCAL_URL, () => {});
  const sql = postgres(LOCAL_URL, { max: 1, onnotice: () => {} });
  // Synthetic institution on screen: never show a real letterhead in QA screenshots.
  const [tpl] = await sql<{ id: string; definition: { institution: { name: string }; detailedReport: { letterheadLines: string[] } } }[]>`
    select id, definition from templates where is_active limit 1`;
  const def = tpl.definition;
  def.institution.name = "Demo Institute of Engineering (synthetic)";
  def.detailedReport.letterheadLines = ["DEPARTMENT OF MECHANICAL ENGINEERING", "DEMO INSTITUTE OF ENGINEERING", "Demo Campus Road, Demo City", "DEMO DATA — SYNTHETIC"];
  await sql`update templates set definition = ${sql.json(def as never)}, name = 'Demo template (synthetic institution)' where id = ${tpl.id}`;
  const email = "qa.admin@demo.test";
  const password = randomBytes(12).toString("base64url"); // local only, never printed
  await createUser(sql, null, { email, name: "Demo Admin (synthetic)", role: "admin", password });
  await sql.end();
  return { email, password };
}

async function startServer(): Promise<ChildProcess> {
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], { env: CLEAN_ENV, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error("server did not start");
}

let n = 0;
async function shot(page: Page, name: string, fullPage = true) {
  await page.waitForTimeout(350);
  const file = path.join(OUT, `${String(++n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log("  saved", path.relative(ROOT, file));
}

async function upload(page: Page, kind: string, file: string, done: RegExp) {
  await page.getByLabel("Document type").selectOption({ label: kind });
  await page.locator('input[type="file"]').setInputFiles(path.join(IN, file));
  await page.getByTestId("upload-job").filter({ hasText: file }).filter({ hasText: done }).first().waitFor({ timeout: 240_000 });
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const creds = await setupDatabase();
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto(`${BASE}/login`);
    await shot(page, "login");
    await page.getByLabel("Email").fill(creds.email);
    await page.getByLabel("Password").fill(`${creds.password}-wrong`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText("Incorrect email or password.").waitFor();
    await shot(page, "login-error");
    await page.getByLabel("Password").fill(creds.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/);
    await shot(page, "dashboard-empty");

    await page.goto(`${BASE}/activities/new`);
    await shot(page, "create-activity");
    await page.getByRole("button", { name: /Create and continue/ }).click();
    await page.waitForURL(/tab=evidence/);
    const activityUrl = page.url().split("?")[0];
    await shot(page, "evidence-empty");

    await upload(page, "Notice", "demo-notice.pdf", /Extracted 1 page/);
    await shot(page, "upload-done-notice");
    // Capture a stage in progress (OCR of a scanned PDF takes a few seconds).
    await page.getByLabel("Document type").selectOption({ label: "Existing activity report" });
    await page.locator('input[type="file"]').setInputFiles(path.join(IN, "demo-activity-report-scan.pdf"));
    await page.getByTestId("upload-job").filter({ hasText: "demo-activity-report-scan.pdf" }).filter({ hasText: /reading text|OCR engine|text layer/ }).first().waitFor({ timeout: 60_000 }).catch(() => {});
    await shot(page, "upload-in-progress", false);
    await page.getByTestId("upload-job").filter({ hasText: "demo-activity-report-scan.pdf" }).filter({ hasText: /Extracted 1 page/ }).first().waitFor({ timeout: 240_000 });
    await upload(page, "Poster", "demo-poster.png", /Extracted 1 page/);
    await upload(page, "Attendance sheet", "demo-attendance-sheet.png", /attendance rows drafted/);
    await upload(page, "Photograph", "demo-event-photo.jpg", /stored as evidence/);
    // Error state: an unsupported file.
    await page.getByLabel("Document type").selectOption({ label: "Notice" });
    await page.locator('input[type="file"]').setInputFiles({ name: "not-really.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
    await page.getByTestId("upload-job").filter({ hasText: "not-really.pdf" }).filter({ hasText: /Failed/ }).first().waitFor();
    await shot(page, "evidence-with-documents-and-error");

    await page.goto(`${activityUrl}?tab=overview`);
    await shot(page, "overview");

    await page.goto(`${activityUrl}?tab=review`);
    await page.getByTestId("field-activity_date").waitFor();
    await shot(page, "review");
    await page.getByTestId("field-activity_date").scrollIntoViewIfNeeded();
    await shot(page, "conflict", false);
    await page.getByTestId("field-category").getByRole("button", { name: "Preview source" }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(1200);
    await shot(page, "source-preview", false);
    await page.keyboard.press("Escape");

    await page.getByTestId("field-activity_date").getByTestId("candidate").filter({ hasText: "06/11/2026" }).filter({ hasText: "demo-activity-report-scan.pdf" }).first().getByRole("button", { name: "Use this value" }).click();
    await page.getByTestId("field-activity_date").getByText(/Selected by reviewer/).waitFor();
    const confirm = page.getByRole("button", { name: "Confirm", exact: true });
    for (let i = 0; i < 20 && (await confirm.count()); i++) {
      await confirm.first().click();
      await page.waitForTimeout(600);
    }

    await page.goto(`${activityUrl}?tab=attendance`);
    await page.getByTestId("new-attendance-row").waitFor();
    await shot(page, "attendance-mismatch");
    const add = page.getByTestId("new-attendance-row");
    await add.getByPlaceholder("#").fill("8");
    await add.getByPlaceholder("Name as written on the sheet").fill("Demo Student Harsh");
    await add.locator("select").selectOption({ label: "Male" });
    await add.getByRole("button", { name: "Add row" }).click();
    await page.getByTestId("attendance-row").filter({ has: page.locator("input[value='Demo Student Harsh']") }).waitFor();
    await page.getByRole("button", { name: "Mark all rows verified" }).click();
    await shot(page, "attendance-confirm-modal", false);
    await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
    await page.getByText("Reconciled", { exact: true }).first().waitFor();
    await shot(page, "attendance-reconciled");

    await page.goto(`${activityUrl}?tab=reports`);
    await shot(page, "reports-empty");
    await page.getByRole("button", { name: /Generate reports/ }).click();
    await page.locator(".paper").waitFor();
    await shot(page, "reports");

    await page.goto(`${activityUrl}?tab=approval`);
    await shot(page, "approve-ready");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByText("This activity is approved and read-only.").waitFor();
    await shot(page, "approved");
    await page.goto(`${activityUrl}?tab=audit`);
    await shot(page, "audit-activity");

    for (const [p, name] of [["/dashboard", "dashboard"], ["/activities", "activities"], ["/documents", "documents"], ["/reports", "reports-library"], ["/templates", "templates"], ["/audit", "audit-log"], ["/settings", "settings"], ["/search?q=demo", "search"]] as const) {
      await page.goto(`${BASE}${p}`);
      await shot(page, name);
    }
    await page.goto(`${BASE}/templates`);
    await page.locator("a[href^='/templates/']").first().click();
    await page.waitForURL(/\/templates\/.+/);
    await shot(page, "template-structure");
    const docHref = await page.goto(`${BASE}/documents`).then(() => page.locator("a[href^='/documents/']").first().getAttribute("href"));
    await page.goto(`${BASE}${docHref}`);
    await page.waitForTimeout(1000);
    await shot(page, "document-viewer", false);

    // Mobile
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
    const mp = await m.newPage();
    for (const [p, name] of [["/dashboard", "m-dashboard"], [`${activityUrl.replace(BASE, "")}?tab=review`, "m-review"], [`${activityUrl.replace(BASE, "")}?tab=attendance`, "m-attendance"], ["/activities", "m-activities"]] as const) {
      await mp.goto(`${BASE}${p}`);
      await shot(mp, name);
    }
    await mp.goto(`${BASE}/dashboard`);
    await mp.getByRole("button", { name: "Open navigation" }).click();
    await shot(mp, "m-nav-drawer", false);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(`Mobile horizontal overflow on dashboard: ${overflow}`);

    console.log(`Browser errors: ${errors.length ? errors.join(" | ") : "none"}`);
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
