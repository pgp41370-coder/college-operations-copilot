# College Operations Copilot

**Activity Documentation Automation**: a web application that helps faculty turn an event's notice, attendance sheet, photographs and details into the institution's standard **Activity Report**, **Detailed Report**, **Attendance Summary** and an auditable **evidence package**. Every extracted value records which document and page it came from. Faculty review and approve the output; nothing is approved automatically.

Pilot environment: Department of Mechanical Engineering, K.D.K. College of Engineering, Nagpur. The first report template is taken from two real activity packets supplied by the department.

> Status: a working MVP for a pilot. It is not "production-ready" for institution-wide use, it is not autonomous, and extraction is not 100% accurate. See [LIMITATIONS.md](LIMITATIONS.md).

---

## 1. Product overview

1. The faculty member creates an activity and types whatever they already know. Every field is optional at this stage and nothing is pre-filled.
2. They upload the evidence: notice or poster, attendance sheet, photographs, and any existing report (PDF, JPG or PNG).
3. The browser extracts text from each document. It uses the PDF text layer when one exists and OCR otherwise. Deterministic rules then propose field values, each with its source document, page, rule, confidence and the exact text snippet.
4. The **Review** screen shows every field with its value, source, confidence and status (`extracted`, `user_entered`, `missing` or `conflicting`). Conflicts are never resolved automatically. Low-confidence values must be confirmed. Every edit keeps the original value, the editor and the time.
5. The **Attendance** screen compares the counts stated in the report (male + female = total) with the attendance rows. Mismatches are flagged and never corrected silently.
6. Reports are generated from the configurable template, using only reviewed field values. A missing value prints as "Not provided".
7. The faculty member approves the activity. Approval is blocked while required fields are missing, while conflicts or unconfirmed low-confidence values remain, or while the counts don't reconcile and no acknowledgement has been recorded.
8. Export as DOCX, PDF or CSV, a JSON provenance manifest, a compiled activity packet (PDF) or an evidence package (ZIP).

## 2. Problem

A 5-response faculty workflow survey was run on 28 Sep 2026 (raw file in `reference-data/`, not committed):

- 4 of the 5 respondents named activity or event report generation as their recent real example of work that took more time than it should.
- 3 of the 5 named report generation as the one frustration they would eliminate.
- 4 answered "Yes" and 1 answered "Maybe" to testing a prototype.

In the reference packets, the same facts are re-typed across the notice, the activity report, the narrative report and the attendance sheet. The documents also disagree: the poster says 31 Oct 2024, while the notice and reports say 06/11/2024. See [PRODUCT.md](PRODUCT.md).

## 3. MVP scope

The MVP includes:

- authentication
- dashboard
- creating an activity
- evidence upload
- extraction with provenance
- conflict and missing-data detection
- attendance review and reconciliation
- Activity Report, Detailed Report and Attendance Summary
- faculty edits
- approval workflow
- audit trail
- activity history
- document viewer
- configurable templates
- exports

Not in scope: timetable or academic-calendar question answering (the future "Knowledge Agent"), email, ERP integrations and multi-institution tenancy.

## 4. Architecture

```
Browser (Next.js client)                     Server (Next.js route handlers, Node)          Postgres
─────────────────────────                    ────────────────────────────────────          ────────
upload file ───────────────────────────────▶ validate (magic bytes, size, PDF parse) ────▶ sources + source_blobs (bytea)
pdf.js text layer / tesseract.js OCR          deterministic parser → field_candidates  ───▶ field_candidates
  (runs locally in the browser)  ── page text ─▶ conflict resolution rules → activity_fields ▶ activity_fields
review / edit / choose ────────────────────▶ service layer (access control, audit)      ───▶ audit_logs
generate / approve / export ───────────────▶ template engine → DOCX / PDF / CSV / JSON  ───▶ generated_reports
packet PDF + ZIP assembled in browser  ◀────  authenticated file endpoints
```

Details are in [ARCHITECTURE.md](ARCHITECTURE.md).

## 5. Tech stack

- **App:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database:** PostgreSQL through `postgres` (postgres.js), with plain SQL migrations
- **Auth:** email and password (bcrypt), with random session tokens stored hashed in Postgres; accounts are created by an administrator
- **Extraction:** `pdfjs-dist` (text layer and rendering) and `tesseract.js` (OCR), both running in the browser; a rule-based parser runs on the server
- **Exports:** `docx`, `pdf-lib`, `jszip`
- **Optional AI:** an adapter for any OpenAI-compatible endpoint. It is off by default and never writes report text.
- **Tests:** Vitest (unit and Postgres integration) and Playwright (browser end-to-end)
- **Hosting target:** Vercel with a free-tier Postgres (see SETUP.md)

## 6. Local setup

Requirements: Node 20.9+ and PostgreSQL 14+. To run the reference-case tests you also need `tesseract` and `poppler` (`brew install tesseract poppler`).

```bash
npm install
```

```bash
createdb college_ops_dev
```

```bash
cp .env.example .env.local
```

```bash
DATABASE_URL=postgres://localhost:5432/college_ops_dev npm run db:migrate
```

```bash
DATABASE_URL=postgres://localhost:5432/college_ops_dev npm run user:create -- --email you@college.edu --name "Your Name" --role admin
```

## 7. Environment variables

See [.env.example](.env.example). `DATABASE_URL` is the only required variable. The `AI_*` variables are optional.

## 8. Database setup

`npm run db:migrate` applies `db/migrations/*.sql` once each and seeds the built-in KDK template. On Vercel, the `vercel-build` script runs migrations before `next build`.

## 9. File storage

Uploaded files are stored in Postgres (`source_blobs`, `bytea`), separately from their metadata. They are served only through an authenticated route that checks access to the activity. There are no public URLs. The limit is 4 MB per file (see LIMITATIONS.md).

## 10. Running locally

```bash
npm run dev
```

Then open http://localhost:3000.

## 11. Testing

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build && npm run test:e2e
```

`npm test` recreates a local `college_ops_test` database. It runs unit tests, Postgres integration tests (workflow, permissions, exports) and the **KDK reference-case tests**, which skip automatically if `reference-data/` or the OCR tools are missing. The Playwright tests run the production build against a fresh `college_ops_e2e` database.

## 12. Deployment

See [SETUP.md](SETUP.md#deployment-vercel).

## 13. Demo workflow

See [docs/DEMO.md](docs/DEMO.md) for what is real and what is synthetic.

## 14. Security

See [SECURITY.md](SECURITY.md).

## 15. Privacy

> Do not upload confidential or personally identifiable information unless your institution has authorized its use.

- The real reference documents contain student names and signatures. They are git-ignored and are never deployed.
- OCR runs in the user's browser, so document images are not sent to any OCR service.
- Attendance names are shown only to the activity owner and to administrators.

## 16. Known limitations

See [LIMITATIONS.md](LIMITATIONS.md). The main ones:

- Handwritten attendance sheets OCR poorly, so every OCR row has to be verified by hand.
- The file limit is 4 MB.
- The pilot has two roles only (faculty and admin).

## 17. Future roadmap

- A College Knowledge Agent that answers questions over the academic calendar, timetable and notices (the architecture leaves room for it; see ARCHITECTURE.md).
- Per-page document-kind tagging for compiled scans.
- Object storage for larger files.
- Department and committee sharing.
- Signature-image evidence.
