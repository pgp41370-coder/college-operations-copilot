# Demo guide: what is real and what is synthetic

## Real

- **The two KDK reference packets** in `reference-data/`:
  - `Essay Writing on Rashtriya Ekta Divas.pdf`
  - `Rashtriya Ekta Divas_Oath.pdf`

  These are real institutional documents with student names, signatures and attendance. They are **git-ignored and never deployed**. They are used locally by `npm test` (reference cases), by `npm run test:e2e` (in-browser OCR of one page) and by `npm run fixtures:load`.
- **The KDK template.** Its labels, table structure, letterhead lines and section headings are copied from those packets. Signatory names are not copied.
- **The survey statistics in PRODUCT.md**, taken from the survey responses file (aggregated only).

## Synthetic (clearly fictional)

- **All document text in unit, integration and E2E tests.** Examples: "Demo Institute of Technology", "Robotics Workshop", dates in 2030–2031, "Synthetic Student One", and `@test.invalid` / `@e2e.test` emails.
- **The tiny generated PDFs and PNGs** used by the tests.

There is **no demo mode with fake data** in the application. A new deployment starts empty.

## Demo walkthrough (local, with real pilot documents)

1. Start from a local database: `npm run db:migrate`, then `npm run user:create …`, then `npm run fixtures:load -- --owner <you>`.
2. Sign in and open either pilot activity. Each packet was split into one file per document kind, and each file's source information records the original pages.
3. Open **Review fields**. Show:
   - that each value has a source page and rule;
   - the **Date of Activity conflict**: the poster's 31/10/2024 against the notice and reports' 06/11/2024;
   - the notice issue date kept as a separate field.
4. Open **Attendance**. Show the OCR draft rows (unverified) and the reconciliation, which will not PASS until the rows are checked.
5. Resolve the date by choosing a candidate. Confirm the low-confidence values. Verify or correct the attendance, or record an acknowledgement.
6. Open **Reports**. Generate, preview, and download the DOCX and PDF files, then the compiled packet and the evidence ZIP.
7. **Approve**, then open **History** to show the audit trail.

## Demo walkthrough (hosted, no real documents)

Create an activity by hand and upload non-sensitive documents (for example, a notice you wrote for the demo). Don't upload real student data unless the institution has authorized it.
