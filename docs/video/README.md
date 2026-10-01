# Product video

A step-by-step walkthrough of College Operations Copilot for teachers (about 9½ minutes): the problem, how the app works in four parts, twelve numbered steps on the deployed app, a recap, the planned roadmap and the pilot. Plain language, a calm pace, and captions on screen throughout.

## Deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | Narration script | [NARRATION.md](NARRATION.md) (generated from `scripts/video/script.ts`) |
| 2 | Shot list | [SHOT_LIST.md](SHOT_LIST.md) |
| 3 | Screen recording plan | [SHOT_LIST.md → Screen recording plan](SHOT_LIST.md#screen-recording-plan) |
| 4 | Architecture animation | `demo/College_Operations_Copilot_Architecture.mp4` (scene 4 on its own, with narration) |
| 5 | Current-system diagram | [current-system.png](current-system.png) |
| 6 | Future-agent diagram | [future-agents.png](future-agents.png) — labelled FUTURE ROADMAP · NOT BUILT YET |
| 7 | Final edited video | `demo/College_Operations_Copilot_Product_Video.mp4` + `.srt` captions |
| 8 | 30–45 s short version | `demo/College_Operations_Copilot_Short.mp4` (captions burned in) |
| 9 | One-page storyboard | [STORYBOARD.pdf](STORYBOARD.pdf) |
| 10 | Pilot feedback form | In the product: Approve tab of an approved activity |
| 11 | Feedback schema | `db/migrations/002_feedback.sql` |
| 12 | How feedback is collected | [../PILOT_FEEDBACK.md](../PILOT_FEEDBACK.md) |

Video files are written to `demo/`, which is git-ignored. Share them directly; they are not committed.

## How it is made

1. **Narration first.** `scripts/video/script.ts` holds every spoken line, the scene labels (CONTEXT / CURRENT PRODUCT / FUTURE ROADMAP / PILOT), the storyboard and the shot list. `npx tsx scripts/video/docs.mts` regenerates the Markdown.
2. **Live recording.** The account owner runs `npx tsx scripts/video/record-product.mts` against the deployed app (see the recording plan). A local rehearsal of the same script: `npx tsx scripts/video/rehearse.mts`.
3. **Build.** `npx tsx scripts/video/build.mts` renders every frame in `scripts/video/compositor.html` (HTML/CSS diagrams, zooms and callouts over the recorded frames), synthesises the narration with the macOS Indian English voice, mixes, and encodes H.264/AAC at 1920×1080, 30 fps.

Footage is never staged: every demo frame is a frame of the production recording. Where footage is sped up to match the narration, the frame shows "Sped up ×N". Recordings that are not from the production URL are watermarked "REHEARSAL · not for publishing".

## Voice

macOS `say` with the Indian English voice **Aman** at 160 words per minute, with pauses between sentences (`VIDEO_VOICE`, `VIDEO_RATE` to change; `Tara` is the alternative). Each line is rendered three times and the median-length take is kept (empty or truncated takes are discarded), because the engine occasionally renders a line far too slowly or not at all. For a more natural voice, download an Enhanced or Premium Indian English voice in System Settings → Accessibility → Spoken Content, set `VIDEO_VOICE` to it, and rebuild. A human voice-over can replace the audio track using the `.srt` timings.

## Claims check

| Claim in the video | Verified against |
|---|---|
| Text read in the browser; PDF text layer, Tesseract OCR for scans | `src/lib/extraction/browser.ts` |
| Every value keeps document, page, rule and text excerpt | `field_candidates` (source, page, rule, snippet) |
| Conflicts are surfaced, never auto-resolved; approval blocked | `src/lib/fields/resolve.ts`, `src/lib/readiness.ts`; production smoke test step "date conflict detected and not auto-resolved" |
| Missing values print as "Not provided" | `src/lib/reports/build.ts` |
| Handwritten attendance rows are drafts until verified | `src/lib/extraction/attendance.ts` (rows saved unverified), `src/lib/reconciliation.ts` |
| Only a person approves; approver and time recorded; record locked | `approveActivity` in `src/lib/server/activities.ts` |
| Exports before approval carry a DRAFT footer | `src/lib/server/exports.ts` |
| Feedback after approval; administrator Pilot page | `src/lib/server/feedback.ts`, `src/app/(app)/pilot/page.tsx` |
| AI language model off in production | `/api/health` → `"ai":"deterministic"` |
| Agents (orchestrator, document, validation, reconciliation, report, follow-up) | **Not built.** Shown only under "FUTURE ROADMAP · NOT BUILT YET". |
| KDK pilot | Described as **planned**. No users, results or partnership terms are claimed. |

No usage numbers, productivity percentages, customers, testimonials or logos appear in the video. The Pilot page still shows whatever the production database held at recording time, with test accounts excluded.
