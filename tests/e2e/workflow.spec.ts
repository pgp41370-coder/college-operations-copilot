/**
 * Browser end-to-end test of the full activity workflow against the
 * production build. Documents are SYNTHETIC PDFs with a text layer.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const users = () => JSON.parse(readFileSync(".cache/e2e-users.json", "utf8")) as { email: string; password: string }[];

async function textPdf(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([595, 842]);
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 790 - i * 18, size: 11, font }));
  return Buffer.from(await doc.save());
}

const REPORT = [
  "Demo Institute of Technology",
  "Activity Report",
  "Session: 2030-31",
  "Category of the Activity: Technical",
  "Title of the Activity Robotics Workshop",
  "Coordinator A. Example, B. Sample",
  "Date of Activity 12/01/2031 Time: 10.00 am",
  "No. of Students Involved: Male: 2 Female: 1 Total: 3",
  "Association/Collaboration Demo Robotics Club",
  "Brief about an Activity Students built line-following robots in small teams.",
  "Objectives To introduce basic robotics and sensors to second-year students.",
  "Outcomes Students assembled and tested working robots.",
  "Faculty Coordinator HoD/ Committee Incharge IQAC Coordinator Principal",
];
const NOTICE = [
  "Date:- 05/01/2031",
  "NOTICE",
  "All the students of the department are hereby informed that a Robotics Workshop",
  "has been organized on 13th January 2031. You are instructed to remain present at",
  "10.00 am in Seminar Hall B-12 for the same. Bring a laptop and a notebook.",
  "",
  "A. Example",
  "Co-ordinator",
];
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function login(page: Page, u: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function upload(page: Page, kind: string, name: string, mimeType: string, buffer: Buffer, expectText: RegExp) {
  await page.getByLabel("Document type").selectOption({ label: kind });
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
  await expect(page.getByText(expectText).first()).toBeVisible({ timeout: 60_000 });
}

test.describe.serial("activity documentation workflow", () => {
  let activityUrl = "";

  test("unauthenticated users are redirected to login; APIs refuse", async ({ page, request }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    const res = await request.get("/api/sources/00000000-0000-0000-0000-000000000000/file");
    expect(res.status()).toBe(401);
    const bad = await request.post("/api/activities", { data: { fields: {} } });
    expect(bad.status()).toBe(403); // no Origin header -> rejected before auth
  });

  test("login rejects a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(users()[0].email);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  test("faculty creates an activity, uploads evidence and sees provenance + conflict", async ({ page }) => {
    await login(page, users()[0]);
    await page.getByRole("link", { name: "Create Activity", exact: true }).first().click();
    await page.getByLabel("Venue").fill("Seminar Hall B-12");
    await page.getByRole("button", { name: /Create and continue/ }).click();
    await expect(page).toHaveURL(/tab=evidence/);
    activityUrl = page.url().split("?")[0];

    await upload(page, "Existing activity report", "report.pdf", "application/pdf", await textPdf(REPORT), /Extracted 1 page/);
    const noticeBytes = await textPdf(NOTICE);
    await upload(page, "Notice", "notice.pdf", "application/pdf", noticeBytes, /Extracted 1 page/);
    await upload(page, "Photograph", "photo.png", "image/png", PNG, /photographs are stored as evidence/);
    // Duplicate upload is rejected.
    // Same bytes under another name (pdf-lib embeds a timestamp, so reuse the buffer).
    await upload(page, "Notice", "notice-copy.pdf", "application/pdf", noticeBytes, /already uploaded/);
    // Invalid type is rejected.
    await upload(page, "Notice", "fake.pdf", "application/pdf", Buffer.from("not a pdf"), /Unsupported file type/);

    await page.getByRole("tab", { name: /^Review/ }).click();
    const category = page.getByTestId("field-category");
    await expect(category).toContainText("Technical");
    await expect(category).toContainText("report.pdf — Page 1");
    await expect(category).toContainText("Deterministic rule");
    const date = page.getByTestId("field-activity_date");
    await expect(date).toContainText("Conflict — review required");
    await expect(page.getByText("Documents contain different values for Date of Activity")).toBeVisible();
  });

  test("reviewer resolves the conflict, checks attendance, generates and approves", async ({ page }) => {
    await login(page, users()[0]);
    await page.goto(`${activityUrl}?tab=review`);
    const card = page.getByTestId("field-activity_date").getByTestId("candidate").filter({ hasText: "12/01/2031" }).filter({ hasText: "report.pdf" }).first();
    await card.getByRole("button", { name: "Use this value" }).click();
    await expect(page.getByTestId("field-activity_date")).toContainText("Selected by reviewer");

    // Confirm any low-confidence values after checking them.
    while (await page.getByRole("button", { name: "Confirm", exact: true }).count()) {
      await page.getByRole("button", { name: "Confirm", exact: true }).first().click();
      await page.waitForTimeout(400);
    }

    // Edit a field manually: history is kept.
    const assoc = page.getByTestId("field-association");
    await assoc.getByRole("button", { name: "Edit" }).click();
    await assoc.locator("input.input").first().fill("Demo Robotics Club (DRC)");
    await assoc.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("field-association")).toContainText("Originally extracted");

    await page.getByRole("tab", { name: /^Attendance/ }).click();
    for (const [n, name, g] of [["1", "Synthetic One", "Male"], ["2", "Synthetic Two", "Male"], ["3", "Synthetic Three", "Female"]]) {
      const row = page.getByTestId("new-attendance-row");
      await row.getByPlaceholder("#").fill(n);
      await row.getByPlaceholder("Name as written on the sheet").fill(name);
      await row.locator("select").selectOption({ label: g });
      await row.getByRole("button", { name: "Add row" }).click();
      await expect(page.locator("td input[value='" + name + "']")).toBeVisible();
    }
    await expect(page.getByText("Reconciled", { exact: true }).first()).toBeVisible();

    await page.getByRole("tab", { name: "Reports" }).click();
    await page.getByRole("button", { name: /Generate reports/ }).click();
    await expect(page.locator(".paper")).toContainText("Robotics Workshop");
    await expect(page.locator(".paper")).toContainText("12/01/2031");

    const dl = page.waitForEvent("download");
    await page.getByRole("link", { name: "Activity Report (.docx)" }).click();
    expect((await dl).suggestedFilename()).toMatch(/activity-report-v1\.docx$/);
    const dl2 = page.waitForEvent("download");
    await page.getByRole("link", { name: "Detailed Report (.pdf)" }).click();
    expect((await dl2).suggestedFilename()).toMatch(/detailed-report-v1\.pdf$/);
    const dl3 = page.waitForEvent("download");
    await page.getByRole("button", { name: "Compiled activity packet (.pdf)" }).click();
    expect((await dl3).suggestedFilename()).toMatch(/activity-packet\.pdf$/);
    const dl4 = page.waitForEvent("download");
    await page.getByRole("button", { name: "Evidence package (.zip)" }).click();
    expect((await dl4).suggestedFilename()).toMatch(/evidence-package\.zip$/);

    await page.getByRole("tab", { name: "Approve" }).click();
    await expect(page.getByText("No blocking issues")).toBeVisible();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText(/Approved by E2E Faculty A/).first()).toBeVisible();

    // Pilot feedback is asked for once the activity is approved.
    const fb = page.getByTestId("feedback-card");
    await expect(fb.getByRole("button", { name: "Submit feedback" })).toBeDisabled();
    await fb.locator("label", { has: page.getByLabel("4 out of 5") }).click();
    await fb.getByText("Minor corrections", { exact: true }).click();
    await fb.getByText("Some", { exact: true }).click();
    await fb.getByText("Yes", { exact: true }).click();
    await fb.getByLabel("What worked well?").fill("Source links on every value");
    await fb.getByRole("button", { name: "Submit feedback" }).click();
    await expect(fb.getByText(/your feedback was recorded \(4\/5\)/)).toBeVisible();
    await page.getByRole("tab", { name: "Audit" }).click();
    for (const a of ["Created activity", "Uploaded document", "Extraction complete", "Conflict resolved", "Field edited", "Reports generated", "Activity approved", "Export downloaded", "Pilot feedback submitted"]) {
      await expect(page.getByText(a, { exact: true }).first()).toBeVisible();
    }
  });

  test("another faculty member cannot open the activity or its files", async ({ page }) => {
    await login(page, users()[1]);
    const res = await page.goto(activityUrl);
    expect(res?.status()).toBe(404);
    // The pilot page is for administrators only.
    expect((await page.goto("/pilot"))?.status()).toBe(404);
    const id = activityUrl.split("/").pop();
    const api = await page.request.get(`/api/activities/${id}/export?type=manifest&format=json`);
    expect(api.status()).toBe(404);
  });
});
