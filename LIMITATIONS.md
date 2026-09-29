# Limitations and known risks

## What is implemented

The full activity documentation workflow in README §1:

- authentication;
- provenance and conflict detection;
- attendance reconciliation;
- three reports;
- DOCX, PDF, CSV and JSON exports, plus the packet PDF and evidence ZIP;
- approval;
- audit trail;
- template configuration.

## What remains manual, by design

- **Resolving conflicts.** Choosing between conflicting dates, times or counts.
- **Confirming low-confidence values.** Any extracted value below 80% confidence, or matched with a fuzzy label, must be confirmed or corrected.
- **Verifying attendance.** Every attendance row read by OCR must be checked against the original sheet.
- **Signatures.** Signing is done on paper. No signature is generated. Signatory names are entered per activity.
- **Choosing the document type** of each upload.

## Extraction accuracy

- **Measured on two documents only.** OCR was measured on the two reference packets: with tesseract.js at the chosen render width, 18 of the 18 checked fields per packet were extracted correctly (see ARCHITECTURE.md). Accuracy on other scans, layouts or photo quality is **unknown**.
- **OCR slips stay visible.** For example, `Mrs. 8. G. Bawane` for `Mrs. S. G. Bawane` in one run. The value is shown for review and is not corrected automatically. It can still carry a high page-level confidence, which is why reviewers should read every value.
- **Handwriting is not reliable.** In the reference tests, OCR drafted 39 rows (Essay) and 36 rows (Oath), and most names were garbled. Gender could not be read on many rows. Rows without a serial number, such as a name squeezed in below row 28, are not detected.
- **English only.** Hindi or Marathi (Devanagari) text is not OCR'd. It is also replaced with "?" in PDF exports, which say so; DOCX exports keep the original text.
- **One kind per upload.** A compiled packet PDF (poster + notice + report in one file) is treated as a single document kind. Upload each part separately, or accept that rules for other kinds won't run on it. Per-page kind tagging is not built.
- **Two templates don't exist yet.** The parser is tuned on the KDK layout. Other institutions' formats need their own template (labels and aliases). The rules are generic, but there is no guarantee they will work unchanged.

## Platform limits

- **File size.** 4 MB per file, because the Vercel function request-body limit is 4.5 MB. Larger phone photos must be resized before upload. The app does not resize them silently.
- **Storage.** Files are stored in Postgres. Free-tier database storage (for example, about 0.5 GB on Neon Free) limits how many activities can be kept before storage has to move elsewhere.
- **OCR speed and network.** OCR runs in the browser. The first use downloads the tesseract.js engine and English data (several MB) from jsDelivr. Each scanned page takes several seconds. Offline OCR is not supported.
- **Scale.** No background job queue. Everything is request-scoped and designed for a pilot.

## Access model

Two roles only: faculty (own activities) and administrator (everything). There is no department, committee or co-coordinator sharing.

## Not built

- Knowledge Agent (academic calendar and timetable Q&A).
- Email notifications.
- MFA.
- Password self-service.
- Postgres row-level security.
- Malware scanning.
- An LLM integration tested against a live model. The adapter is unit-tested with a mocked endpoint only.

## Deployment state (as of 29 Sep 2026)

- The app is deployed to Vercel (Hobby, region bom1) at https://college-operations-copilot.vercel.app. Production serves commit `bcd9075`.
- Later deployments (commit `6f89224` onward) were **blocked by Vercel** (`TEAM_ACCESS_REQUIRED`: the commit author's GitHub identity is not recognised as a member of the Vercel team). The account owner must connect the GitHub account to the Vercel account, or authorise the deployment in the Vercel dashboard. Until then, the deployed build returns HTTP 500 instead of redirecting to /login when no database is configured. This was fixed in `6f89224` but has not been deployed.
- **No hosted database is attached yet.** Provisioning one requires the account owner to accept a provider's terms; see SETUP.md §Deployment, step 1.
- Until a database is attached, the site shows the sign-in page with a "database is not configured" notice, and `/api/health` reports `not_configured`.
- The full signed-in workflow has been verified only against the production build running locally: Playwright, a local Postgres database, and a real browser. It has **not** yet been verified on the hosted deployment.
