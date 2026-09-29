/**
 * Real in-browser OCR (tesseract.js) on one page of a real KDK reference
 * packet. Local only: skipped when reference-data/ is absent. Requires network
 * access for the browser to download the OCR engine from jsDelivr.
 */
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

const PACKET = "reference-data/Rashtriya Ekta Divas_Oath.pdf";

test.skip(!existsSync(PACKET), "reference-data not available");

test("scanned activity report is OCR'd in the browser and fields are extracted with provenance", async ({ page }) => {
  const users = JSON.parse(readFileSync(".cache/e2e-users.json", "utf8"));
  const src = await PDFDocument.load(readFileSync(PACKET));
  const out = await PDFDocument.create();
  const [p] = await out.copyPages(src, [2]); // page 3: the structured activity report
  out.addPage(p);
  const buffer = Buffer.from(await out.save());

  await page.goto("/login");
  await page.getByLabel("Email").fill(users[0].email);
  await page.getByLabel("Password").fill(users[0].password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/activities/new");
  await page.getByRole("button", { name: /Create and continue/ }).click();
  await page.getByLabel("Document type").selectOption({ label: "Existing activity report" });
  await page.locator('input[type="file"]').setInputFiles({ name: "activity-report-scan.pdf", mimeType: "application/pdf", buffer });
  await expect(page.getByText(/Extracted 1 page/)).toBeVisible({ timeout: 170_000 });
  await page.getByRole("button", { name: "2 · Review fields" }).click();
  const row = page.locator("tr", { hasText: "Category of the Activity" }).first();
  await expect(row).toContainText("Social Resposibility");
  await expect(page.locator("tr", { hasText: "Total students" }).first()).toContainText("45");
  await expect(page.locator("tr", { hasText: "Date of Activity" }).first()).toContainText("06/11/2024");
});
