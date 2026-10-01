/**
 * Product video: narration, storyboard and shot list in one place.
 * The video builder and docs/video/*.md are generated from this file, so the
 * spoken words, the on-screen labels and the documentation cannot drift apart.
 *
 * Every line under a CURRENT scene describes behaviour of the deployed app
 * (verified against the repository and the production smoke test). Lines
 * under FUTURE scenes describe plans and are labelled on screen.
 */

export type Status = "CONTEXT" | "CURRENT PRODUCT" | "FUTURE ROADMAP" | "PILOT";

export interface Line {
  /** What the narrator says (and what the captions/docs show). */
  text: string;
  /** Optional spelling for the speech engine (e.g. "O C R"). */
  say?: string;
  /** Pause after the line, seconds. */
  pause?: number;
}

export interface Scene {
  id: string;
  title: string;
  status: Status;
  target: number; // planned seconds
  visual: string; // storyboard description
  shots: string[]; // shot list
  lines: Line[];
  /** Where the claim is verified (CURRENT scenes). */
  evidence?: string;
}

const say = (text: string, s: string, pause?: number): Line => ({ text, say: s, pause });

export const SCENES: Scene[] = [
  {
    id: "s01-problem",
    title: "The problem",
    status: "CONTEXT",
    target: 25,
    visual: "Synthetic evidence documents appear one by one in a flow: poster → notice → attendance sheet → photos → activity report → approval → final documentation. Then four short issue labels.",
    shots: ["Poster card", "Notice card", "Handwritten attendance sheet card", "Photo card", "Activity report card", "Approval stamp card", "Issue labels: scattered · conflicting · handwritten · copied by hand"],
    lines: [
      { text: "We started with a simple problem." },
      { text: "College activities generate information across multiple documents: a poster, a notice, an attendance sheet, photographs, and a report that has to be approved." },
      { text: "The information is scattered. Dates and details do not always match. Attendance is often handwritten." },
      { text: "And someone has to copy it all by hand, check it, and do it again for the next activity.", pause: 0.6 },
    ],
  },
  {
    id: "s02-question",
    title: "The core question",
    status: "CONTEXT",
    target: 15,
    visual: "Dark slate. The question types in, centred.",
    shots: ["Question on screen: “How can we automate the repetitive work without allowing AI to invent institutional facts?”"],
    lines: [
      { text: "The challenge is not just generating a report. It is knowing whether the information in that report is actually supported by the evidence." },
      { text: "So our question was: how can we automate the repetitive work, without allowing AI to invent institutional facts?", pause: 0.6 },
    ],
  },
  {
    id: "s03-product",
    title: "Introducing the product",
    status: "CURRENT PRODUCT",
    target: 15,
    visual: "Product name and subtitle over a soft indigo gradient; a screenshot of the real dashboard slides in behind.",
    shots: ["Title: COLLEGE OPERATIONS COPILOT", "Subtitle: Evidence-grounded automation for institutional operations", "Real dashboard screenshot"],
    lines: [
      { text: "This is College Operations Copilot." },
      { text: "It automates the repetitive documentation workflow, and we designed it around evidence and human verification.", pause: 0.5 },
    ],
  },
  {
    id: "s04-architecture",
    title: "Current architecture",
    status: "CURRENT PRODUCT",
    target: 28,
    visual: "Animated pipeline of the implemented system, each stage lighting up as it is mentioned: Evidence → Ingestion → OCR / extraction → Provenance → Validation → Conflict detection → Human review → Report generation → Approval → Export. Ends on the principle strip.",
    shots: ["Pipeline diagram (current system)", "Principle strip: AI assists · Evidence supports · Validation checks · Humans approve"],
    evidence: "src/lib/extraction/browser.ts (pdf.js text layer, Tesseract OCR in the browser); src/lib/extraction/parser.ts (deterministic rules); field_candidates + activity_fields provenance; src/lib/readiness.ts (blocking checks); src/lib/reports/build.ts; approveActivity; /api/health reports ai: deterministic in production.",
    lines: [
      say("Here is the current system. Faculty upload the evidence, and the text is read in the browser: from the PDF where possible, with OCR for scans.", "Here is the current system. Faculty upload the evidence, and the text is read in the browser: from the P D F where possible, with O C R for scans."),
      { text: "Rules extract each field, and every value keeps its source: the document, the page and the exact text." },
      { text: "Validation checks for gaps, low confidence and conflicts. A person reviews, and only a faculty member can approve the final record." },
      { text: "Missing information is marked as not provided. It is never filled in." },
      { text: "AI assists. Evidence supports. Validation checks. Humans approve.", pause: 0.6 },
    ],
  },
  {
    id: "s05a-demo",
    title: "Live demo — sign in, create, upload, provenance",
    status: "CURRENT PRODUCT",
    target: 52,
    visual: "Screen recording of the deployed app (college-operations-copilot.vercel.app) with a demo faculty account and synthetic documents. Callouts on key UI regions.",
    shots: ["Login (demo faculty account)", "Dashboard (real counts)", "Create activity (blank)", "Upload notice, scanned report, poster, attendance sheet, photo — stage progress", "Overview: trust summary", "Review: value with source badge, rule and confidence", "Preview source drawer"],
    evidence: "Recorded live against production; same flow as scripts/prod-smoke.mts (24/24 passed on the deployed commit).",
    lines: [
      { text: "Let me show you the deployed product, with synthetic documents." },
      { text: "I sign in as a demo faculty member. The dashboard only shows counts taken from the database." },
      { text: "I create an activity, and upload the evidence: a notice, a scanned report, a poster, the attendance sheet and a photograph." },
      say("Each stage is shown as it happens: uploading, reading, OCR, extracting and validating. Photographs are stored as evidence only.", "Each stage is shown as it happens: uploading, reading, O C R, extracting and validating. Photographs are stored as evidence only."),
      { text: "In review, every value shows its file, page, rule and confidence, and I can open the source page right beside the extracted text.", pause: 0.5 },
    ],
  },
  {
    id: "s06-conflict",
    title: "The date conflict",
    status: "CURRENT PRODUCT",
    target: 30,
    visual: "Zoom into the real conflict card: four source values side by side. Callouts: “Conflict detected”, “Source: Poster”, “Source: Notice”, “Human review required”. Then the reviewer chooses a value.",
    shots: ["Conflict card (Date of Activity)", "Candidate 31/10/2026 — Poster", "Candidate 06/11/2026 — Notice / report / attendance sheet", "Approval blocked", "Reviewer chooses — recorded in audit"],
    evidence: "src/lib/fields/resolve.ts (typed conflicts, never auto-resolved); readiness blocks approval on conflict; chooseCandidate writes field.conflict_resolved to the audit log.",
    lines: [
      { text: "This is the most important part." },
      { text: "The poster says the thirty-first of October. The other three documents say the sixth of November." },
      { text: "When documents disagree, the system does not silently choose an answer. Instead, it surfaces the conflict for review, with every candidate and its source, and approval stays blocked until a person decides." },
      { text: "Here I choose the date from the activity report, and that decision is recorded.", pause: 0.5 },
    ],
  },
  {
    id: "s07-attendance",
    title: "Attendance verification",
    status: "CURRENT PRODUCT",
    target: 24,
    visual: "Attendance tab: OCR rows marked “Needs verification”, the reconciliation bars (8 stated vs 7 rows), adding the missing row, verifying, “Reconciled”. Then a small flow: Extracted → Needs review → Human verification → Verified.",
    shots: ["OCR draft rows — Needs verification", "Counts differ: stated 8, rows 7", "Add missing row", "Mark rows verified (confirmation)", "Reconciled"],
    evidence: "src/lib/extraction/attendance.ts (rows saved unverified); src/lib/reconciliation.ts; gender taken only from the sheet.",
    lines: [
      say("Handwritten attendance is difficult for OCR. So the system treats extracted rows as a draft, not as verified truth.", "Handwritten attendance is difficult for O C R. So the system treats extracted rows as a draft, not as verified truth."),
      { text: "Here the report says eight students, but only seven rows were read." },
      { text: "I check the sheet, add the missing name, and verify the rows. Only then do the counts reconcile.", pause: 0.5 },
    ],
  },
  {
    id: "s05b-demo",
    title: "Live demo — reports, approval, export",
    status: "CURRENT PRODUCT",
    target: 26,
    visual: "Reports tab: generate, preview the Activity Report; Approve tab: readiness checklist, Approve; downloads; audit timeline.",
    shots: ["Generate reports", "Report preview with document details", "Approval checklist → Approve", "Exports (DOCX, PDF, packet)", "Audit timeline"],
    evidence: "src/lib/reports/build.ts; DRAFT footer in src/lib/server/exports.ts; approveActivity requires no blocking issues and records approver + time.",
    lines: [
      { text: "Next, I generate the reports. They are built only from the reviewed fields, using the department's template." },
      { text: "Approval is a human action. The system checks that nothing is blocking, records who approved and when, and locks the record." },
      { text: "Then I can export Word and PDF files, a compiled packet and the evidence package. Every step is in the audit trail.", pause: 0.5 },
    ],
  },
  {
    id: "s08-result",
    title: "The result",
    status: "CURRENT PRODUCT",
    target: 14,
    visual: "Four-step flow: Documents → Structured evidence → Validated information → Approved report.",
    shots: ["Flow: Documents → Structured evidence → Validated information → Approved report"],
    lines: [
      { text: "So: from scattered documents, to structured evidence, to validated information, to an approved report." },
      { text: "The goal is to reduce repetitive documentation work, while the institution keeps control of what is recorded.", pause: 0.6 },
    ],
  },
  {
    id: "s09-future",
    title: "Future agentic system",
    status: "FUTURE ROADMAP",
    target: 42,
    visual: "Persistent “FUTURE ROADMAP — not built yet” label. Agent diagram builds top-down: Orchestrator → Document / Validation / Reconciliation agents → Report agent → Follow-up agent → Faculty approval.",
    shots: ["FUTURE ROADMAP label", "Orchestrator", "Document agent", "Validation agent", "Reconciliation agent", "Report agent", "Follow-up agent", "Faculty approval (human)"],
    lines: [
      { text: "The current product focuses on this evidence-grounded workflow. The next phase, and this is a roadmap, not something that exists today, is specialised agents that coordinate these workflows." },
      { text: "A document agent organises the evidence. A validation agent checks it against rules. A reconciliation agent prepares conflicts for a person. A report agent drafts from approved evidence. And a follow-up agent spots missing documentation." },
      { text: "An orchestrator would coordinate them, and faculty approval stays at the end." },
      { text: "These are the next capabilities we intend to build, after validating the current workflow with real users.", pause: 0.6 },
    ],
  },
  {
    id: "s10-pilot",
    title: "The pilot",
    status: "PILOT",
    target: 20,
    visual: "Pilot loop: Faculty → Use product → Complete activity → Give feedback → Identify friction → Improve product → Repeat.",
    shots: ["Pilot (planned): Mechanical Engineering, KDK College of Engineering, Nagpur", "Loop diagram"],
    lines: [
      say("That validation starts with a pilot, planned with the Mechanical Engineering department of KDK College of Engineering, Nagpur.", "That validation starts with a pilot, planned with the Mechanical Engineering department of K D K College of Engineering, Nagpur."),
      { text: "Faculty use the product for real activities and give feedback. We find the friction, improve the product, and repeat." },
      { text: "The pilot is meant to test whether the workflow genuinely saves effort and is useful to faculty.", pause: 0.5 },
    ],
  },
  {
    id: "s11-feedback",
    title: "Feedback in the product",
    status: "CURRENT PRODUCT",
    target: 26,
    visual: "Screen recording: the feedback card on an approved activity (rating, what worked, what was difficult, corrections, manual work, would use again) and the administrator’s Pilot page.",
    shots: ["Feedback card after approval", "Submitted", "Pilot page: metrics from the database + responses"],
    evidence: "db/migrations/002_feedback.sql; src/lib/server/feedback.ts; /pilot page (administrators).",
    lines: [
      { text: "To make that feedback systematic, the product asks for it." },
      { text: "After approval, faculty rate the experience, say what worked and what was difficult, whether the report needed corrections, how much manual work remained, and whether they would use it again." },
      { text: "Administrators see these answers next to counts taken from the system itself.", pause: 0.5 },
    ],
  },
  {
    id: "s12-closing",
    title: "Closing",
    status: "CONTEXT",
    target: 16,
    visual: "Product name, tagline, then three rows: Current — Evidence-grounded workflow; Next — Agentic college operations (roadmap); Pilot — Learn → Improve → Scale.",
    shots: ["COLLEGE OPERATIONS COPILOT", "From scattered evidence to validated institutional documentation.", "Current / Next / Pilot rows"],
    lines: [
      { text: "College Operations Copilot: from scattered evidence to validated institutional documentation." },
      { text: "Today, an evidence-grounded workflow. Next, agentic college operations. And through the pilot: learn, improve, and then scale." },
      { text: "Thank you.", pause: 1.2 },
    ],
  },
];

/** 30–45 second cut for a CV or LinkedIn. */
export const SHORT: { scene: string; lines: Line[] }[] = [
  { scene: "s01-problem", lines: [{ text: "College activities leave scattered evidence: posters, notices, handwritten attendance sheets." }] },
  { scene: "s05a-demo", lines: [{ text: "College Operations Copilot turns that evidence into the institution's reports, and every value keeps its source." }] },
  { scene: "s06-conflict", lines: [{ text: "When documents disagree, it does not guess. It flags the conflict for a person to decide." }] },
  { scene: "s07-attendance", lines: [{ text: "Handwritten attendance stays a draft until someone verifies it." }] },
  { scene: "s05b-demo", lines: [{ text: "Reports are built from reviewed fields, and only a faculty member can approve." }] },
  { scene: "s09-future", lines: [{ text: "Next, after a pilot with real faculty: specialised agents, on the same evidence-first rules.", pause: 0.4 }] },
  { scene: "s12-closing", lines: [{ text: "College Operations Copilot.", pause: 3.2 }] },
];
