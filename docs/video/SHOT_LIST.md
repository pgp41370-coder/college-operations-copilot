# Product video — storyboard, shot list and recording plan

Generated from `scripts/video/script.ts`.

## Storyboard

| # | Scene | Label | On-screen step | Visual |
|---|---|---|---|---|
| 1 | The problem | CONTEXT | — | The documents of one activity appear one by one: poster, notice, attendance sheet, photographs, activity report, approval, final record. Then four short problems. |
| 2 | What we wanted | CONTEXT | — | Calm title card. The question appears: “Can a computer do the repetitive work — without ever making up facts?” |
| 3 | Introducing the app | CURRENT PRODUCT | — | Product name and a screenshot of the real dashboard. |
| 4 | How it works, in four parts | CURRENT PRODUCT | — | Four large cards light up in turn: 1 You upload · 2 The app reads and fills in · 3 You check and decide · 4 You approve and download. Then a note: missing details are marked “Not provided”. |
| 5 | Sign in | CURRENT PRODUCT | Step 1 of 12 · Sign in | Live recording: the sign-in page; a demo teacher account signs in. |
| 6 | Your dashboard | CURRENT PRODUCT | Step 2 of 12 · Your dashboard | Dashboard: activity counts, what needs attention, Create Activity. |
| 7 | Create the activity | CURRENT PRODUCT | Step 3 of 12 · Create the activity | Create Activity page: the seven-step progress bar, the form, the department's report format, the button to continue. |
| 8 | Upload your documents | CURRENT PRODUCT | Step 4 of 12 · Upload your documents | Evidence tab: choosing the document type, uploading five files, each file's progress, then the list of documents. |
| 9 | See the summary | CURRENT PRODUCT | Step 5 of 12 · See the summary | Overview tab: the coloured summary of every detail, with a colour key, and the list of what still needs attention. |
| 10 | Check each detail | CURRENT PRODUCT | Step 6 of 12 · Check each detail | Review tab: a detail with its source; Preview source opens the original page beside the text; a 'Needs review' detail is confirmed. |
| 11 | When documents disagree | CURRENT PRODUCT | Step 6 of 12 · When documents disagree | Zoom on the Date of Activity: four values side by side, the poster's date in red. The teacher chooses the correct one. |
| 12 | Check the attendance | CURRENT PRODUCT | Step 7 of 12 · Check the attendance | Attendance tab: names read from the sheet marked 'Needs verification'; the counts compared (8 stated, 7 names); adding the missing name; marking all rows verified; 'Reconciled'. |
| 13 | Create the reports | CURRENT PRODUCT | Step 8 of 12 · Create the reports | Reports tab: Generate reports; the three reports; the Activity Report preview with a “Not provided” detail; the Detailed Report and the Attendance Summary. |
| 14 | Approve | CURRENT PRODUCT | Step 9 of 12 · Approve | Approve tab: the checklist all green; Approve; approved and locked, with the teacher's name and time. |
| 15 | Download and print | CURRENT PRODUCT | Step 10 of 12 · Download and print | Reports tab after approval: Word and PDF downloads, the complete packet. |
| 16 | History | CURRENT PRODUCT | Step 11 of 12 · History | Audit tab: the timeline of everything that happened. |
| 17 | Tell us what you think | CURRENT PRODUCT | Step 12 of 12 · Tell us what you think | Feedback form on the approved activity, filled in and saved; then the administrator's Pilot page (counts only). |
| 18 | Recap | CURRENT PRODUCT | — | Four steps in a row: You upload → The app fills in, with sources → You check and decide → You approve and download. |
| 19 | What we plan next | FUTURE ROADMAP | — | “Future roadmap · not built yet”. Planned helpers appear one by one, with faculty approval at the end. |
| 20 | The pilot | PILOT | — | Planned pilot: Mechanical Engineering, KDK College of Engineering, Nagpur. A loop: teachers use the app → finish an activity → give feedback → we find what is difficult → improve → repeat. |
| 21 | Closing | CONTEXT | — | Product name, tagline, and three rows: Today / Next (not built yet) / Pilot. |

## Shot list

### 1. The problem

- Poster
- Notice
- Attendance sheet
- Photographs
- Activity report
- Approval
- Final record
- Four problems: scattered · may disagree · handwritten · copied by hand

### 2. What we wanted

- Question card

### 3. Introducing the app

- College Operations Copilot
- Real dashboard

### 4. How it works, in four parts

- Four-part diagram
- “Not provided” note

### 5. Sign in

- Sign-in page
- Typing email and password
- Sign in

### 6. Your dashboard

- Activity counts
- Needs attention
- Create Activity button

### 7. Create the activity

- Seven-step progress bar
- Optional details form
- Create and continue

### 8. Upload your documents

- Document type
- Upload box
- Notice
- Scanned report
- Poster
- Attendance sheet
- Photograph
- Documents list

### 9. See the summary

- Coloured summary
- Colour key
- What needs attention

### 10. Check each detail

- Category: Technical, from the scanned report, page 1
- Preview source
- Needs review → Confirm

### 11. When documents disagree

- Documents disagree
- Poster: 31/10/2026
- Notice, report, attendance sheet: 06/11/2026
- Teacher chooses
- Choice recorded

### 12. Check the attendance

- Names marked Needs verification
- Counts differ: 8 and 7
- Add the missing name
- Mark all rows verified
- Numbers match

### 13. Create the reports

- Generate reports
- Three report cards
- Activity Report preview
- “Not provided”
- Detailed Report
- Attendance Summary
- Draft label

### 14. Approve

- Checklist
- Approve button
- Approved and locked

### 15. Download and print

- Word file
- PDF
- Complete packet

### 16. History

- History timeline

### 17. Tell us what you think

- Feedback form
- Saved
- Administrator's Pilot page

### 18. Recap

- Recap flow

### 19. What we plan next

- Built today
- Coordinator (planned)
- Document helper
- Checking helper
- Disagreement helper
- Report helper
- Follow-up helper
- Teacher approval

### 20. The pilot

- Pilot (planned)
- Learning loop

### 21. Closing

- College Operations Copilot
- From scattered documents to an approved report — with the teacher in control.
- Today / Next / Pilot

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
