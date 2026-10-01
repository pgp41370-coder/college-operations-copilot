# Architecture

## Principles

1. **Provenance first.** Every factual value is one of three things:
   - extracted from a named source page by a named rule;
   - entered by a user;
   - missing.

   The `inferred` status exists in the schema but nothing in the MVP produces it.
2. **No silent resolution.** When documents disagree on a date, a time or a count, the field is `conflicting` and a person must choose.
3. **Deterministic by default.** Only rules and templates are used. Nothing is labelled "AI" unless a model was actually called.
4. **Configuration over code.** Institution wording, fields, labels and layouts live in a template (JSON), not in business logic. A test asserts that `src/` contains no reference event names.

## Components

| Layer | Location | Notes |
|---|---|---|
| Schema | `db/migrations/001_init.sql`, `002_feedback.sql` | users, sessions, rate_limit_events, templates, activities, sources, source_blobs, source_extractions, field_candidates, activity_fields, attendance_records, generated_reports, audit_logs, activity_feedback (pilot feedback) |
| Template | `src/lib/templates/` | zod-validated definition. The built-in KDK template is `kdk-mech-v1.ts`, seeded by the migration script. Edits create new versions. |
| Browser extraction | `src/lib/extraction/browser.ts` | pdf.js text layer (lines rebuilt from item coordinates). OCR fallback with tesseract.js (English, PSM 4) on pages with fewer than 200 text characters. |
| Line rebuilding | `src/lib/extraction/layout.ts` | Groups words into lines by their geometry. Never adds or changes words. |
| Parser | `src/lib/extraction/parser.ts` | Rules per document kind (see below). Produces `FieldCandidate`s with rule, page, confidence and snippet. |
| Attendance | `src/lib/extraction/attendance.ts` | Drafts rows from OCR. Gender comes only from the gender cell. Every row is unverified. |
| Resolution | `src/lib/fields/resolve.ts` | Candidates → one state per field (rules below). |
| Reconciliation | `src/lib/reconciliation.ts` | Stated M + F = T; attendance rows vs stated counts. |
| Readiness | `src/lib/readiness.ts` | Blocking issues vs warnings that gate approval. |
| Report builders | `src/lib/reports/build.ts` | Output is pure data. Missing values render as "Not provided". |
| Exports | `src/lib/exports/*`, `src/lib/server/exports.ts` | DOCX (docx), PDF (pdf-lib), CSV, JSON manifest. The packet PDF and the ZIP are assembled in the browser. |
| Service layer | `src/lib/server/activities.ts` etc. | Every function takes the acting user and enforces access. Every write is audited. |
| API | `src/app/api/**/route.ts` | Thin wrappers: session, same-origin check, zod validation. |
| UI | `src/app/(app)/**` | Server components read through the service layer; client components call the API. |
| Pilot feedback | `src/lib/server/feedback.ts`, `src/app/(app)/pilot` | Feedback form after approval (one response per person per activity). Admin-only Pilot page with metrics counted from the database. See `docs/PILOT_FEEDBACK.md`. |
| AI adapter | `src/lib/ai/provider.ts` | `AIProvider` interface. `DeterministicProvider` is the default. `OpenAICompatibleProvider` is optional. |

## Parser rules by document kind

- **Existing activity report / supporting document.** "Label value" rows, matched against the template's field `aliases`. Handles:
  - labels wrapped across lines ("Brief about an / Activity");
  - values placed above their label, as happens in vertically centred table cells. This case only applies when the line above ends mid-phrase, and it is marked `wrapped_cell` with confidence 0.5;
  - the "Male: x Female: y Total: z" counts row;
  - stopping at the signature table.
- **Detailed report.** The "Date:-" line gives `report_date`. The "Topic-" line gives the title. The body up to "Impact Analysis" gives `event_description`, plus any date and time stated in it. The first paragraph after the heading gives `impact_analysis`.
- **Notice.** The header "Date:-" gives `notice_date`, which is the *issue* date and never the activity date. "on <date>" in the body gives `activity_date`. The time, the venue ("in … classroom/hall …"), and the first quoted phrase (as a low-confidence title) are also read from the body.
- **Poster.** Printed dates become activity-date candidates with confidence 0.5. Posters often show the commemorated day, so a disagreement surfaces as a conflict. The line after "organizes" is taken as the title (0.5). "In collaboration with …" gives the association (0.5).
- **Attendance.** The sheet date becomes an activity-date candidate, and rows are drafted separately.
- **Photograph.** Nothing is read from photographs, ever.

**Label matching.** Labels match exactly or approximately; the approximate match handles OCR slips such as "Topie-" for "Topic-". The allowed edit distance is:

| Label length | Allowed edit distance |
|---|---|
| Section headings of 5+ characters | 1 |
| Table labels of 10+ characters | 1 |
| Labels of 16+ characters | 2 |

Approximate matches carry `:fuzzy_label` in the rule name and are capped at 0.75 confidence, so the reviewer must confirm them.

**Confidence.** A candidate's confidence is the lower of the rule's confidence and the OCR engine's page confidence.

## Resolution rules

1. A value the user entered or confirmed is never overwritten by re-extraction.
2. A field with no candidates is `missing`.
3. For `date`, `time` and `integer` fields, candidates that disagree make the field `conflicting` with no value.
4. For text fields, candidates are ranked by:
   1. confidence band (0.8 and above first);
   2. template `sourcePriority`;
   3. page number.

   The top candidate is used and the others are shown as alternatives. Different wording is not treated as a factual conflict.
5. Extracted values below 0.8 confidence block approval until they are confirmed or edited.

## Status workflow

`DRAFT → PROCESSING → REVIEW_REQUIRED ⇄ READY_FOR_APPROVAL → APPROVED → ARCHIVED`

- The status is recomputed after every change, except for APPROVED and ARCHIVED activities.
- READY_FOR_APPROVAL requires no blocking issues and reports that are newer than the last change.
- APPROVED is set only by an authenticated user's explicit action, which records `approved_by` and `approved_at`. Approved activities are read-only.
- Only an administrator can reopen an approved activity, and a reason is required.
- An extraction stuck in `processing` for more than 15 minutes (for example, a closed tab) is treated as failed.

## OCR render width

OCR accuracy on the pilot scans varied with render resolution. To choose a width, every text page of both reference packets was rendered with pdf.js and OCR'd with tesseract.js, and the correctly extracted fields were counted. The count is out of 18 checked fields per packet:

| Render width (px) | 1100 | 1224 | 1300 | 1400 | 1500 | 1700 | 2040 | 2448 |
|---|---|---|---|---|---|---|---|---|
| Oath packet | 18 | 18 | 18 | 18 | 17 | 16 | 15 | 13 |
| Essay packet | 18 | 18 | 18 | 17 | 17 | 16 | 13 | 13 |

The 1100–1700 widths were measured after fuzzy label matching was added. The 2040 and 2448 widths were only measured before it. The app uses **1224 px**. This choice rests on two documents only; re-measure it when more pilot documents are available.

## Why extraction runs in the browser

- **No cost.** There is no OCR service to pay for.
- **No timeouts.** OCR takes several seconds per page, which does not fit serverless request limits.
- **Privacy.** Document images are not sent to a third party. Only the tesseract.js engine and language data are downloaded from jsDelivr.

The trade-off is that the server trusts page text submitted by an authenticated user. This is acceptable because that same user is the reviewer and approver. The original file is always stored, so extraction can be re-run.

## Storage

Files are stored in `source_blobs.data` (bytea). They are validated by magic bytes and by parsing, capped at 4 MB, deduplicated per activity by SHA-256, and served with `Cache-Control: private, no-store`. The Vercel request-body limit (4.5 MB) sets the cap. The storage code is isolated in the service layer so it can move to object storage later.

## Optional LLM adapter (grounded extraction)

`OpenAICompatibleProvider.extractFields` asks the model for `{field, value, quote, page}` items. `groundLlmValue` keeps an item only when all three hold:

1. the quote occurs, after normalisation, in the text of the cited page;
2. the value parses as the field's type;
3. the value is stated inside the quote.

Accepted values are stored with method `llm`, rule `llm:grounded_quote` and confidence 0.6. They therefore always need reviewer confirmation, and they conflict with rule-based values when they disagree. Report narrative is never generated by a model. `summarize()` returns `null` in the MVP.

## Future: College Knowledge Agent

The pieces a Knowledge Agent would reuse already exist:

- `sources` and `source_extractions` store page text with provenance for any document kind;
- templates are data;
- the `AIProvider` interface can add an `answer(question, pages)` method with the same grounded-quote rule.

Adding the agent would mean:

- new source kinds (`academic_calendar`, `timetable`, `circular`);
- a search index over `source_extractions`;
- a Q&A screen that only answers with cited pages.

None of this is built in the MVP.
