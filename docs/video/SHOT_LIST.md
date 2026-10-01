# Product video — storyboard, shot list and recording plan

Generated from `scripts/video/script.ts`.

## Storyboard

| # | Scene | Label | Planned | Visual |
|---|---|---|---|---|
| 1 | The problem | CONTEXT | 25 s | Synthetic evidence documents appear one by one in a flow: poster → notice → attendance sheet → photos → activity report → approval → final documentation. Then four short issue labels. |
| 2 | The core question | CONTEXT | 15 s | Dark slate. The question types in, centred. |
| 3 | Introducing the product | CURRENT PRODUCT | 15 s | Product name and subtitle over a soft indigo gradient; a screenshot of the real dashboard slides in behind. |
| 4 | Current architecture | CURRENT PRODUCT | 28 s | Animated pipeline of the implemented system, each stage lighting up as it is mentioned: Evidence → Ingestion → OCR / extraction → Provenance → Validation → Conflict detection → Human review → Report generation → Approval → Export. Ends on the principle strip. |
| 5 | Live demo — sign in, create, upload, provenance | CURRENT PRODUCT | 52 s | Screen recording of the deployed app (college-operations-copilot.vercel.app) with a demo faculty account and synthetic documents. Callouts on key UI regions. |
| 6 | The date conflict | CURRENT PRODUCT | 30 s | Zoom into the real conflict card: four source values side by side. Callouts: “Conflict detected”, “Source: Poster”, “Source: Notice”, “Human review required”. Then the reviewer chooses a value. |
| 7 | Attendance verification | CURRENT PRODUCT | 24 s | Attendance tab: OCR rows marked “Needs verification”, the reconciliation bars (8 stated vs 7 rows), adding the missing row, verifying, “Reconciled”. Then a small flow: Extracted → Needs review → Human verification → Verified. |
| 8 | Live demo — reports, approval, export | CURRENT PRODUCT | 26 s | Reports tab: generate, preview the Activity Report; Approve tab: readiness checklist, Approve; downloads; audit timeline. |
| 9 | The result | CURRENT PRODUCT | 14 s | Four-step flow: Documents → Structured evidence → Validated information → Approved report. |
| 10 | Future agentic system | FUTURE ROADMAP | 42 s | Persistent “FUTURE ROADMAP — not built yet” label. Agent diagram builds top-down: Orchestrator → Document / Validation / Reconciliation agents → Report agent → Follow-up agent → Faculty approval. |
| 11 | The pilot | PILOT | 20 s | Pilot loop: Faculty → Use product → Complete activity → Give feedback → Identify friction → Improve product → Repeat. |
| 12 | Feedback in the product | CURRENT PRODUCT | 26 s | Screen recording: the feedback card on an approved activity (rating, what worked, what was difficult, corrections, manual work, would use again) and the administrator’s Pilot page. |
| 13 | Closing | CONTEXT | 16 s | Product name, tagline, then three rows: Current — Evidence-grounded workflow; Next — Agentic college operations (roadmap); Pilot — Learn → Improve → Scale. |

## Shot list

### 1. The problem

- Poster card
- Notice card
- Handwritten attendance sheet card
- Photo card
- Activity report card
- Approval stamp card
- Issue labels: scattered · conflicting · handwritten · copied by hand

### 2. The core question

- Question on screen: “How can we automate the repetitive work without allowing AI to invent institutional facts?”

### 3. Introducing the product

- Title: COLLEGE OPERATIONS COPILOT
- Subtitle: Evidence-grounded automation for institutional operations
- Real dashboard screenshot

### 4. Current architecture

- Pipeline diagram (current system)
- Principle strip: AI assists · Evidence supports · Validation checks · Humans approve

### 5. Live demo — sign in, create, upload, provenance

- Login (demo faculty account)
- Dashboard (real counts)
- Create activity (blank)
- Upload notice, scanned report, poster, attendance sheet, photo — stage progress
- Overview: trust summary
- Review: value with source badge, rule and confidence
- Preview source drawer

### 6. The date conflict

- Conflict card (Date of Activity)
- Candidate 31/10/2026 — Poster
- Candidate 06/11/2026 — Notice / report / attendance sheet
- Approval blocked
- Reviewer chooses — recorded in audit

### 7. Attendance verification

- OCR draft rows — Needs verification
- Counts differ: stated 8, rows 7
- Add missing row
- Mark rows verified (confirmation)
- Reconciled

### 8. Live demo — reports, approval, export

- Generate reports
- Report preview with document details
- Approval checklist → Approve
- Exports (DOCX, PDF, packet)
- Audit timeline

### 9. The result

- Flow: Documents → Structured evidence → Validated information → Approved report

### 10. Future agentic system

- FUTURE ROADMAP label
- Orchestrator
- Document agent
- Validation agent
- Reconciliation agent
- Report agent
- Follow-up agent
- Faculty approval (human)

### 11. The pilot

- Pilot (planned): Mechanical Engineering, KDK College of Engineering, Nagpur
- Loop diagram

### 12. Feedback in the product

- Feedback card after approval
- Submitted
- Pilot page: metrics from the database + responses

### 13. Closing

- COLLEGE OPERATIONS COPILOT
- From scattered evidence to validated institutional documentation.
- Current / Next / Pilot rows

## Screen recording plan

The demo is recorded on the **deployed production app**, not a local copy and not a mock-up.

1. **Who runs it.** The account owner runs `npx tsx scripts/video/record-product.mts` in a terminal. It asks for an administrator email and password in a hidden prompt; they stay in memory and are never printed, saved or recorded.
2. **Demo identity.** Off camera, the script uses the administrator session only to create a temporary faculty account named "Demo Faculty (synthetic)" with a `@demo-video.invalid` address and a random password. Everything on camera is done as that account, so no real name or email appears.
3. **Data.** Only the synthetic documents from `scripts/demo/make-demo-docs.mts` are uploaded (fictional event, fictional students). A badge "Synthetic demonstration data" is shown on every demo frame.
4. **Capture.** Chromium at 1920×1080, captured frame by frame through the DevTools screencast (JPEG quality 92) with timestamps, so the edit keeps real timing. The script records markers and on-screen element positions for callouts.
5. **Clean takes.** If any step fails, the script stops and the take is discarded; it is re-run from the start. No debugging screens are used.
6. **Clean-up (off camera).** The demo activity is archived and the temporary account is deactivated. Pilot metrics exclude accounts on `.invalid` addresses, so this run does not count as pilot usage.
7. **Never shown.** Passwords (fields show dots), API keys, database credentials, real student data, personal email addresses, private reference documents.

## Editing

- Clean cuts; subtle zooms toward the region being discussed; callout boxes with short labels ("Evidence source", "Conflict detected", "Human review required", "Report approved").
- Diagrams and title cards are HTML/CSS rendered frame by frame (no stock footage, no AI imagery).
- No background music. Narration is always the only audio.
- Future agents appear only inside a scene labelled **FUTURE ROADMAP — not built yet**.
