# Product video — narration

Generated from `scripts/video/script.ts`. Edit that file, then run `npx tsx scripts/video/docs.mts`.

- **Voice:** macOS Indian English voice (default `Aman`, alternative `Tara`), rate 190. Set `VIDEO_VOICE` / `VIDEO_RATE` to change.
- **Labels:** each scene is marked CONTEXT, CURRENT PRODUCT, FUTURE ROADMAP or PILOT. Only CURRENT PRODUCT scenes describe what the deployed app does today.
- **Order:** the live demo is split around the conflict and attendance scenes (5A → 6 → 7 → 5B) so the recording follows the real workflow order.

## The problem · `CONTEXT`

> We started with a simple problem.
>
> College activities generate information across multiple documents: a poster, a notice, an attendance sheet, photographs, and a report that has to be approved.
>
> The information is scattered. Dates and details do not always match. Attendance is often handwritten.
>
> And someone has to copy it all by hand, check it, and do it again for the next activity.

## The core question · `CONTEXT`

> The challenge is not just generating a report. It is knowing whether the information in that report is actually supported by the evidence.
>
> So our question was: how can we automate the repetitive work, without allowing AI to invent institutional facts?

## Introducing the product · `CURRENT PRODUCT`

> This is College Operations Copilot.
>
> It automates the repetitive documentation workflow, and we designed it around evidence and human verification.

## Current architecture · `CURRENT PRODUCT`

> Here is the current system. Faculty upload the evidence, and the text is read in the browser: from the PDF where possible, with OCR for scans.
>
> Rules extract each field, and every value keeps its source: the document, the page and the exact text.
>
> Validation checks for gaps, low confidence and conflicts. A person reviews, and only a faculty member can approve the final record.
>
> Missing information is marked as not provided. It is never filled in.
>
> AI assists. Evidence supports. Validation checks. Humans approve.

Verified against: src/lib/extraction/browser.ts (pdf.js text layer, Tesseract OCR in the browser); src/lib/extraction/parser.ts (deterministic rules); field_candidates + activity_fields provenance; src/lib/readiness.ts (blocking checks); src/lib/reports/build.ts; approveActivity; /api/health reports ai: deterministic in production.

## Live demo — sign in, create, upload, provenance · `CURRENT PRODUCT`

> Let me show you the deployed product, with synthetic documents.
>
> I sign in as a demo faculty member. The dashboard only shows counts taken from the database.
>
> I create an activity, and upload the evidence: a notice, a scanned report, a poster, the attendance sheet and a photograph.
>
> Each stage is shown as it happens: uploading, reading, OCR, extracting and validating. Photographs are stored as evidence only.
>
> In review, every value shows its file, page, rule and confidence, and I can open the source page right beside the extracted text.

Verified against: Recorded live against production; same flow as scripts/prod-smoke.mts (24/24 passed on the deployed commit).

## The date conflict · `CURRENT PRODUCT`

> This is the most important part.
>
> The poster says the thirty-first of October. The other three documents say the sixth of November.
>
> When documents disagree, the system does not silently choose an answer. Instead, it surfaces the conflict for review, with every candidate and its source, and approval stays blocked until a person decides.
>
> Here I choose the date from the activity report, and that decision is recorded.

Verified against: src/lib/fields/resolve.ts (typed conflicts, never auto-resolved); readiness blocks approval on conflict; chooseCandidate writes field.conflict_resolved to the audit log.

## Attendance verification · `CURRENT PRODUCT`

> Handwritten attendance is difficult for OCR. So the system treats extracted rows as a draft, not as verified truth.
>
> Here the report says eight students, but only seven rows were read.
>
> I check the sheet, add the missing name, and verify the rows. Only then do the counts reconcile.

Verified against: src/lib/extraction/attendance.ts (rows saved unverified); src/lib/reconciliation.ts; gender taken only from the sheet.

## Live demo — reports, approval, export · `CURRENT PRODUCT`

> Next, I generate the reports. They are built only from the reviewed fields, using the department's template.
>
> Approval is a human action. The system checks that nothing is blocking, records who approved and when, and locks the record.
>
> Then I can export Word and PDF files, a compiled packet and the evidence package. Every step is in the audit trail.

Verified against: src/lib/reports/build.ts; DRAFT footer in src/lib/server/exports.ts; approveActivity requires no blocking issues and records approver + time.

## The result · `CURRENT PRODUCT`

> So: from scattered documents, to structured evidence, to validated information, to an approved report.
>
> The goal is to reduce repetitive documentation work, while the institution keeps control of what is recorded.

## Future agentic system · `FUTURE ROADMAP`

> The current product focuses on this evidence-grounded workflow. The next phase, and this is a roadmap, not something that exists today, is specialised agents that coordinate these workflows.
>
> A document agent organises the evidence. A validation agent checks it against rules. A reconciliation agent prepares conflicts for a person. A report agent drafts from approved evidence. And a follow-up agent spots missing documentation.
>
> An orchestrator would coordinate them, and faculty approval stays at the end.
>
> These are the next capabilities we intend to build, after validating the current workflow with real users.

## The pilot · `PILOT`

> That validation starts with a pilot, planned with the Mechanical Engineering department of KDK College of Engineering, Nagpur.
>
> Faculty use the product for real activities and give feedback. We find the friction, improve the product, and repeat.
>
> The pilot is meant to test whether the workflow genuinely saves effort and is useful to faculty.

## Feedback in the product · `CURRENT PRODUCT`

> To make that feedback systematic, the product asks for it.
>
> After approval, faculty rate the experience, say what worked and what was difficult, whether the report needed corrections, how much manual work remained, and whether they would use it again.
>
> Administrators see these answers next to counts taken from the system itself.

Verified against: db/migrations/002_feedback.sql; src/lib/server/feedback.ts; /pilot page (administrators).

## Closing · `CONTEXT`

> College Operations Copilot: from scattered evidence to validated institutional documentation.
>
> Today, an evidence-grounded workflow. Next, agentic college operations. And through the pilot: learn, improve, and then scale.
>
> Thank you.

## Short version (30–45 s, for a CV or LinkedIn)

> College activities leave scattered evidence: posters, notices, handwritten attendance sheets.
>
> College Operations Copilot turns that evidence into the institution's reports, and every value keeps its source.
>
> When documents disagree, it does not guess. It flags the conflict for a person to decide.
>
> Handwritten attendance stays a draft until someone verifies it.
>
> Reports are built from reviewed fields, and only a faculty member can approve.
>
> Next, after a pilot with real faculty: specialised agents, on the same evidence-first rules.
>
> College Operations Copilot.


Word count: full 734, short 81.
