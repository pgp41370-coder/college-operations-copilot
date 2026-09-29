/**
 * Signed-in end-to-end smoke test against a DEPLOYED instance.
 *
 *   npx tsx scripts/prod-smoke.mts [--base-url https://college-operations-copilot.vercel.app] [--headed]
 *
 * Run it yourself: it asks for an ADMIN email and password (hidden input) and
 * keeps them in memory only — they are never printed or written to disk.
 *
 * Uses the SYNTHETIC demo documents (scripts/demo/make-demo-docs.mts); never
 * real reference data. It creates in production:
 *   - one activity titled "[SMOKE TEST] …" (approved, then archived), and
 *   - one temporary faculty account with a random password (deactivated at the end),
 * all recorded in the audit log. Results (no secrets): .cache/prod-smoke/result.json
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { hiddenPrompt, prompt } from "./lib/prompt";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const BASE = (arg("base-url") ?? "https://college-operations-copilot.vercel.app").replace(/\/$/, "");
const HEADED = process.argv.includes("--headed");
const ROOT = process.cwd();
const IN = path.join(ROOT, "demo", "input");
const OUT = path.join(ROOT, ".cache", "prod-smoke");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

interface StepResult {
  step: string;
  ok: boolean;
  ms: number;
  detail: string;
}
const results: StepResult[] = [];
let page: Page;

async function step(name: string, fn: () => Promise<string | void>) {
  const t = Date.now();
  process.stdout.write(`• ${name} … `);
  try {
    const detail = (await fn()) ?? "";
    results.push({ step: name, ok: true, ms: Date.now() - t, detail });
    console.log(`PASS (${((Date.now() - t) / 1000).toFixed(1)}s)${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 300);
    results.push({ step: name, ok: false, ms: Date.now() - t, detail: msg });
    console.log(`FAIL — ${msg}`);
    await page?.screenshot({ path: path.join(OUT, `fail-${results.length}.png`), fullPage: true }).catch(() => {});
    throw e;
  }
}

async function login(email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

async function logout() {
  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
}

async function upload(kind: string, file: string, done: RegExp) {
  await page.getByLabel("Document type").selectOption({ label: kind });
  await page.locator('input[type="file"]').setInputFiles(path.join(IN, file));
  await page.locator("div.rounded-md", { hasText: file }).filter({ hasText: done }).first().waitFor({ timeout: 240_000 });
  const err = await page.locator("div.rounded-md.border-red-200", { hasText: file }).count();
  if (err) throw new Error(`upload/extraction error shown for ${file}`);
}

async function download(trigger: () => Promise<void>): Promise<{ name: string; bytes: Buffer }> {
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), trigger()]);
  const file = path.join(OUT, `${STAMP}-${d.suggestedFilename()}`);
  await d.saveAs(file);
  return { name: d.suggestedFilename(), bytes: readFileSync(file) };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!existsSync(path.join(IN, "demo-notice.pdf"))) execFileSync("npx", ["tsx", "scripts/demo/make-demo-docs.mts"], { stdio: "inherit" });

  console.log(`Production smoke test against ${BASE}`);
  console.log("Use an ADMIN account. Credentials stay in memory and are never printed or saved.\n");
  const email = await prompt("Admin email: ");
  const password = await hiddenPrompt("Admin password (hidden): ");
  const tempEmail = `smoke-${randomBytes(4).toString("hex")}@smoke-test.invalid`;
  const tempPassword = randomBytes(15).toString("base64url"); // random, memory only
  let browser: Browser | undefined;
  let activityUrl = "";

  try {
    browser = await chromium.launch({ headless: !HEADED });
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
    page.on("dialog", (d) => d.accept());

    await step("Health endpoints report database connected and migrations current", async () => {
      const h = await (await fetch(`${BASE}/api/health`)).json();
      const d = await (await fetch(`${BASE}/api/health/db`)).json();
      if (!h.ok || h.migrations !== "current" || !d.ok) throw new Error(`health=${JSON.stringify(h)} db.ok=${d.ok}`);
      return `tables ${d.tablesPresent}/${d.tablesExpected}`;
    });
    await step("Protected route redirects to login when signed out", async () => {
      await page.goto(`${BASE}/dashboard`);
      await page.waitForURL(/\/login/);
    });
    await step("Login rejects a wrong password", async () => {
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(`${password}-wrong`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.getByText("Incorrect email or password.").waitFor({ timeout: 20_000 });
    });
    await step("Login (admin)", () => login(email, password));
    await step("Dashboard loads", async () => {
      await page.getByRole("heading", { name: /Welcome/ }).waitFor();
    });
    await step("Create activity (all fields blank)", async () => {
      await page.getByRole("link", { name: "Create Activity", exact: true }).click();
      await page.getByRole("button", { name: /Create and continue/ }).click();
      await page.waitForURL(/tab=evidence/);
      activityUrl = page.url().split("?")[0];
      return activityUrl.replace(BASE, "");
    });
    await step("Upload digital PDF notice → text-layer extraction", () => upload("Notice", "demo-notice.pdf", /Extracted 1 page/));
    await step("Upload scanned PDF activity report → in-browser OCR", () => upload("Existing activity report", "demo-activity-report-scan.pdf", /Extracted 1 page/));
    await step("Upload poster image (PNG) → OCR", () => upload("Poster", "demo-poster.png", /Extracted 1 page/));
    await step("Upload attendance sheet image → OCR drafts rows", () => upload("Attendance sheet", "demo-attendance-sheet.png", /attendance rows drafted/));
    await step("Upload photograph (JPG) → stored as evidence only", () => upload("Photograph", "demo-event-photo.jpg", /stored as evidence/));

    await step("Provenance shown for extracted values", async () => {
      await page.getByRole("button", { name: /2 · Review fields/ }).click();
      const row = page.locator("tr", { hasText: "Category of the Activity" }).first();
      await row.getByText("Technical").waitFor();
      await row.getByText("demo-activity-report-scan.pdf — Page 1").waitFor();
      await row.getByText("Deterministic rule").waitFor();
      return "Category = Technical ← demo-activity-report-scan.pdf p.1 (deterministic rule)";
    });
    await step("31 Oct vs 6 Nov date conflict detected and not auto-resolved", async () => {
      const row = page.locator("tr", { hasText: "Date of Activity" }).first();
      await row.getByText("Conflict — review required").waitFor();
      await page.getByText("Documents contain different values for Date of Activity").waitFor();
      await page.locator("div.rounded-md", { hasText: "31/10/2026" }).filter({ hasText: "demo-poster.png" }).first().waitFor();
      await page.locator("div.rounded-md", { hasText: "06/11/2026" }).filter({ hasText: "demo-notice.pdf" }).first().waitFor();
      return "poster 31/10/2026 vs notice/report/attendance 06/11/2026";
    });
    await step("Reviewer resolves the conflict, confirms low-confidence values, marks title as smoke test", async () => {
      await page.locator("div.rounded-md", { hasText: "06/11/2026" }).filter({ hasText: "demo-activity-report-scan.pdf" }).first()
        .getByRole("button", { name: "Use this value" }).click();
      await page.locator("tr", { hasText: "Date of Activity" }).first().getByText("Selected by reviewer").waitFor();
      const confirm = page.getByRole("button", { name: "Confirm", exact: true });
      let n = 0;
      while ((await confirm.count()) && n < 20) {
        await confirm.first().click();
        await page.waitForTimeout(700);
        n++;
      }
      const title = page.locator("tr", { hasText: "Title of the Activity" }).first();
      await title.getByRole("button", { name: "Edit" }).click();
      await title.locator("input.input").first().fill("[SMOKE TEST] Engineering Drawing Quiz (synthetic)");
      await title.getByRole("button", { name: "Save" }).click();
      await page.locator("tr", { hasText: "Title of the Activity" }).first().getByText("Originally extracted").waitFor();
      return `${n} low-confidence value(s) confirmed; manual edit kept original value`;
    });
    await step("Attendance mismatch flagged, then reconciled by reviewer", async () => {
      await page.getByRole("button", { name: /3 · Attendance/ }).click();
      await page.getByText(/Participant-count mismatch detected: 7 attendance rows vs stated total 8/).waitFor();
      const add = page.locator("tr.bg-slate-50");
      await add.getByPlaceholder("#").fill("8");
      await add.getByPlaceholder("Name as written on the sheet").fill("Demo Student Harsh");
      await add.locator("select").selectOption({ label: "Male" });
      await add.getByRole("button", { name: "Add row" }).click();
      await page.getByRole("button", { name: "Mark all rows verified" }).click();
      await page.getByText("8 of 8").first().waitFor({ timeout: 30_000 });
      await page.getByText("PASS").first().waitFor();
      return "7 OCR rows → FAIL; +1 verified row → PASS";
    });
    await step("Generate Activity Report, Detailed Report and Attendance Summary", async () => {
      await page.getByRole("button", { name: /4 · Reports/ }).click();
      await page.getByRole("button", { name: /Generate reports/ }).click();
      await page.locator(".paper").getByText("[SMOKE TEST] Engineering Drawing Quiz (synthetic)").first().waitFor({ timeout: 60_000 });
      await page.getByRole("button", { name: "Detailed Report", exact: true }).click();
      await page.locator(".paper").getByText("Impact Analysis:").waitFor();
      await page.getByRole("button", { name: "Attendance Summary", exact: true }).click();
      await page.locator(".paper").getByText("Reconciliation: PASS").waitFor();
    });
    await step("Approve (human action) → read-only", async () => {
      await page.getByRole("button", { name: /5 · Approve/ }).click();
      await page.getByText("No blocking issues").waitFor();
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await page.getByText(/Approved by /).first().waitFor({ timeout: 30_000 });
      await page.getByText("This activity is approved and read-only.").waitFor();
    });
    await step("Download DOCX and PDF exports and validate them", async () => {
      await page.getByRole("button", { name: /4 · Reports/ }).click();
      const link = (n: string) => page.getByRole("link", { name: n });
      const docx = await download(() => link("Activity Report (.docx)").click());
      const xml = await (await JSZip.loadAsync(docx.bytes)).file("word/document.xml")!.async("string");
      if (!xml.includes("SMOKE TEST")) throw new Error("DOCX does not contain the activity title");
      const checked: string[] = [docx.name];
      for (const n of ["Activity Report (.pdf)", "Detailed Report (.pdf)", "Attendance Summary (.pdf)", "Detailed Report (.docx)"]) {
        const f = await download(() => link(n).click());
        if (f.name.endsWith(".pdf")) {
          const pdf = await PDFDocument.load(f.bytes);
          if (pdf.getPageCount() < 1) throw new Error(`${f.name} has no pages`);
        } else {
          await JSZip.loadAsync(f.bytes);
        }
        checked.push(f.name);
      }
      return checked.join(", ");
    });
    await step("Audit trail records the workflow", async () => {
      await page.getByRole("button", { name: "History" }).click();
      for (const a of ["Created activity", "Uploaded document", "Extraction complete", "Conflict resolved", "Field edited", "Reports generated", "Activity approved", "Export downloaded"]) {
        await page.getByRole("cell", { name: a }).first().waitFor();
      }
    });
    await step("Create temporary faculty account (random password, not shown)", async () => {
      await page.goto(`${BASE}/settings`);
      const form = page.locator("form", { has: page.getByPlaceholder("Temporary password") });
      await form.getByPlaceholder("Full name").fill("Smoke Test Faculty (temporary)");
      await form.getByPlaceholder("Email").fill(tempEmail);
      await form.locator("select").selectOption("faculty");
      await form.getByPlaceholder("Temporary password").fill(tempPassword);
      await form.getByRole("button", { name: "Add user" }).click();
      await page.getByText(tempEmail).waitFor({ timeout: 30_000 });
      return tempEmail;
    });
    await step("Logout", logout);
    await step("Another faculty user cannot open the activity or its exports", async () => {
      await login(tempEmail, tempPassword);
      const res = await page.goto(activityUrl);
      if (res?.status() !== 404) throw new Error(`expected 404, got ${res?.status()}`);
      const id = activityUrl.split("/").pop();
      const api = await page.request.get(`${BASE}/api/activities/${id}/export?type=manifest&format=json`);
      if (api.status() !== 404) throw new Error(`export API returned ${api.status()}`);
      await logout();
      return "page 404, export API 404";
    });
    await step("Cleanup: deactivate temporary account and archive the smoke-test activity", async () => {
      await login(email, password);
      await page.goto(`${BASE}/settings`);
      const row = page.locator("tr", { hasText: tempEmail });
      await row.getByRole("button", { name: "Deactivate" }).click();
      await row.getByText("Deactivated").waitFor({ timeout: 30_000 });
      await page.goto(`${activityUrl}?tab=approval`);
      await page.getByRole("button", { name: "Archive" }).click();
      await page.getByText("This activity is archived and read-only.").waitFor({ timeout: 30_000 });
    });
    await step("Logout and protected routes are closed again", async () => {
      await logout();
      await page.goto(`${BASE}/dashboard`);
      await page.waitForURL(/\/login/);
    });
  } catch {
    // failure already recorded
  } finally {
    await browser?.close();
    const passed = results.filter((r) => r.ok).length;
    const summary = { baseUrl: BASE, ranAt: new Date().toISOString(), passed, failed: results.length - passed, allPassed: passed === results.length && results.length > 0, results };
    writeFileSync(path.join(OUT, "result.json"), JSON.stringify(summary, null, 2));
    console.log(`\n${passed}/${results.length} steps passed. Results: .cache/prod-smoke/result.json`);
    process.exit(summary.allPassed ? 0 : 1);
  }
}

main();
