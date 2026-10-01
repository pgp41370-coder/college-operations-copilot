/**
 * Product video: narration, storyboard and shot list in one place.
 * The video builder and docs/video/*.md are generated from this file, so the
 * spoken words, the on-screen captions and the documentation cannot drift.
 *
 * Audience: teachers, not engineers. Plain words, one idea per sentence,
 * every screen explained at a calm pace. No technical terms (no "OCR",
 * "provenance", "pipeline", "deterministic").
 *
 * Every line under a CURRENT PRODUCT scene describes the deployed app
 * (verified against the repository and the production smoke test). FUTURE
 * ROADMAP lines describe plans and are labelled on screen.
 */

export type Status = "CONTEXT" | "CURRENT PRODUCT" | "FUTURE ROADMAP" | "PILOT";

export interface Line {
  /** What the narrator says (also the on-screen caption). */
  text: string;
  /** Optional spelling for the speech engine (e.g. "K D K"). */
  say?: string;
  /** Pause after the line, seconds (default 0.6). */
  pause?: number;
}

export interface Scene {
  id: string;
  title: string;
  status: Status;
  /** Walkthrough step shown on screen, e.g. "Step 4 of 12 · Upload your documents". */
  step?: string;
  visual: string;
  shots: string[];
  lines: Line[];
  /** Where the claims are verified (CURRENT scenes). */
  evidence?: string;
}

const say = (text: string, s: string, pause?: number): Line => ({ text, say: s, pause });
const STEPS = 12;
const step = (n: number, name: string) => `Step ${n} of ${STEPS} · ${name}`;

export const SCENES: Scene[] = [
  {
    id: "g01-problem",
    title: "The problem",
    status: "CONTEXT",
    visual: "The documents of one activity appear one by one: poster, notice, attendance sheet, photographs, activity report, approval, final record. Then four short problems.",
    shots: ["Poster", "Notice", "Attendance sheet", "Photographs", "Activity report", "Approval", "Final record", "Four problems: scattered · may disagree · handwritten · copied by hand"],
    lines: [
      { text: "After every college activity, whether it is a workshop, a seminar or a quiz, a teacher has to prepare an activity report." },
      { text: "The information for that report is spread across many papers: the poster, the notice, the attendance sheet, and the photographs." },
      { text: "Sometimes these papers do not even agree. The poster may show one date, and the notice another." },
      { text: "So the teacher reads everything, copies the details by hand into the college format, checks them, and gets the report approved." },
      { text: "And then does it all again, for the next activity.", pause: 1 },
    ],
  },
  {
    id: "g02-question",
    title: "What we wanted",
    status: "CONTEXT",
    visual: "Calm title card. The question appears: “Can a computer do the repetitive work — without ever making up facts?”",
    shots: ["Question card"],
    lines: [
      { text: "We wanted to save teachers from this repetitive work." },
      { text: "But with one important rule: the computer must never make up information." },
      { text: "Every detail in an official report must come from a real document, and a teacher must always have the final say.", pause: 1 },
    ],
  },
  {
    id: "g03-product",
    title: "Introducing the app",
    status: "CURRENT PRODUCT",
    visual: "Product name and a screenshot of the real dashboard.",
    shots: ["College Operations Copilot", "Real dashboard"],
    lines: [
      { text: "That is why we built College Operations Copilot." },
      { text: "In this video, I will walk you through it slowly, step by step, exactly as a teacher would use it.", pause: 1 },
    ],
  },
  {
    id: "g04-how",
    title: "How it works, in four parts",
    status: "CURRENT PRODUCT",
    visual: "Four large cards light up in turn: 1 You upload · 2 The app reads and fills in · 3 You check and decide · 4 You approve and download. Then a note: missing details are marked “Not provided”.",
    shots: ["Four-part diagram", "“Not provided” note"],
    evidence: "Browser text reading (src/lib/extraction/browser.ts); rules fill fields with document, page and text excerpt (field_candidates); review actions; approveActivity; NOT_PROVIDED in src/lib/reports/build.ts.",
    lines: [
      { text: "The idea is simple. There are four parts." },
      { text: "First, you upload the documents you already have." },
      { text: "Second, the app reads them and fills in the report details for you. Next to every detail, it shows which document, and which page, it came from." },
      { text: "Third, you check those details. You correct anything that is wrong, and you decide whenever two documents disagree." },
      { text: "And fourth, you approve the report, and download it, ready to print and sign." },
      { text: "If a detail is not found in any document, the app does not guess. It simply marks it as “Not provided”, so you can fill it in yourself.", pause: 1 },
    ],
  },
  {
    id: "w01-signin",
    title: "Sign in",
    status: "CURRENT PRODUCT",
    step: step(1, "Sign in"),
    visual: "Live recording: the sign-in page; a demo teacher account signs in.",
    shots: ["Sign-in page", "Typing email and password", "Sign in"],
    lines: [
      { text: "Let us begin. This is the real app, running online. For this demonstration, I am using sample documents for a made-up event, so no real student information is shown." },
      { text: "Your administrator creates your account. You simply enter your email and password, and click “Sign in”.", pause: 0.8 },
    ],
  },
  {
    id: "w02-dashboard",
    title: "Your dashboard",
    status: "CURRENT PRODUCT",
    step: step(2, "Your dashboard"),
    visual: "Dashboard: activity counts, what needs attention, Create Activity.",
    shots: ["Activity counts", "Needs attention", "Create Activity button"],
    lines: [
      { text: "This is your dashboard. It is your home page." },
      { text: "At the top, you can see how many activities you have, and how many are waiting for your review." },
      { text: "This is a new account, so everything is zero. To start a new activity report, click “Create Activity”.", pause: 0.8 },
    ],
  },
  {
    id: "w03-create",
    title: "Create the activity",
    status: "CURRENT PRODUCT",
    step: step(3, "Create the activity"),
    visual: "Create Activity page: the seven-step progress bar, the form, the department's report format, the button to continue.",
    shots: ["Seven-step progress bar", "Optional details form", "Create and continue"],
    lines: [
      { text: "This bar shows the whole journey, in seven steps, from entering the details to the final approval." },
      { text: "You can type the details you already know, like the title or the venue. But you do not have to. You can leave everything blank, because the app will try to fill these in from your documents." },
      { text: "Your department's report format is already selected. Click “Create and continue to evidence”.", pause: 0.8 },
    ],
  },
  {
    id: "w04-upload",
    title: "Upload your documents",
    status: "CURRENT PRODUCT",
    step: step(4, "Upload your documents"),
    visual: "Evidence tab: choosing the document type, uploading five files, each file's progress, then the list of documents.",
    shots: ["Document type", "Upload box", "Notice", "Scanned report", "Poster", "Attendance sheet", "Photograph", "Documents list"],
    evidence: "4 MB limit and PDF/JPG/PNG (evidence tab and server checks); text read in the browser, PDF text first, scans read from the image; photographs stored only.",
    lines: [
      { text: "Now we upload the documents. First, choose what kind of document it is, for example, “Notice”. Then drag the file into this box, or click “browse files”." },
      { text: "You can upload PDF files and pictures, in JPG or PNG format, up to four megabytes each." },
      { text: "As each file is uploaded, the app reads the text inside it. A typed PDF is read almost instantly. A scanned page, or a photo of a page, takes a few seconds longer, because the app has to read the words from the picture." },
      { text: "Here I upload the notice, the scanned activity report, the poster, and the attendance sheet." },
      { text: "Photographs of the event are simply kept as evidence. The app does not try to read anything from them." },
      { text: "Each document now appears in this list. You can open it, read it again, or remove it at any time.", pause: 0.8 },
    ],
  },
  {
    id: "w05-overview",
    title: "See the summary",
    status: "CURRENT PRODUCT",
    step: step(5, "See the summary"),
    visual: "Overview tab: the coloured summary of every detail, with a colour key, and the list of what still needs attention.",
    shots: ["Coloured summary", "Colour key", "What needs attention"],
    evidence: "src/lib/trust.ts (verified / source-backed / needs review / conflict / not provided); readiness issues list.",
    lines: [
      { text: "Now open the “Overview” tab. It gives you a quick summary of every detail in the report, using colours." },
      { text: "Blue means the detail was taken from one of your documents. Amber means, please check it, because the app was not fully sure. Red means two documents disagree. Grey means the detail was not found. And green means you have already checked it yourself." },
      { text: "Below that, the app lists exactly what still needs your attention, before the report can be approved.", pause: 0.8 },
    ],
  },
  {
    id: "w06-review",
    title: "Check each detail",
    status: "CURRENT PRODUCT",
    step: step(6, "Check each detail"),
    visual: "Review tab: a detail with its source; Preview source opens the original page beside the text; a 'Needs review' detail is confirmed.",
    shots: ["Category: Technical, from the scanned report, page 1", "Preview source", "Needs review → Confirm"],
    evidence: "Review cards show value, document and page; Preview source drawer; values below 80% confidence must be confirmed (src/lib/trust.ts, readiness).",
    lines: [
      { text: "Now open the “Review” tab. Here, every detail of the report is listed, one by one." },
      { text: "Look at “Category of the Activity”. The app found the word “Technical”. Just below it, you can see exactly where it came from: the scanned activity report, page one." },
      { text: "To see the original, click “Preview source”. The page opens right beside the text the app read, so you can compare them with your own eyes." },
      { text: "Some details are marked “Needs review”. This means the app was not fully sure of what it read. After checking it, you click “Confirm”. If it is wrong, you click “Edit”, and type the correct value.", pause: 0.8 },
    ],
  },
  {
    id: "w07-conflict",
    title: "When documents disagree",
    status: "CURRENT PRODUCT",
    step: step(6, "When documents disagree"),
    visual: "Zoom on the Date of Activity: four values side by side, the poster's date in red. The teacher chooses the correct one.",
    shots: ["Documents disagree", "Poster: 31/10/2026", "Notice, report, attendance sheet: 06/11/2026", "Teacher chooses", "Choice recorded"],
    evidence: "Conflicts are never resolved automatically and block approval (src/lib/fields/resolve.ts, src/lib/readiness.ts); the choice is recorded in the history.",
    lines: [
      { text: "Now, the most important part. Look at the “Date of Activity”. It is marked in red, because the documents disagree." },
      { text: "The poster says the thirty-first of October. But the notice, the activity report, and the attendance sheet all say the sixth of November." },
      { text: "The app does not pick one for you. It shows you every value, with the document it came from, and it will not let the report be approved until you decide." },
      { text: "You know the correct date, so you choose it. Here, I click “Use this value” on the activity report. The app records that a teacher made this choice, and when.", pause: 0.8 },
    ],
  },
  {
    id: "w08-attendance",
    title: "Check the attendance",
    status: "CURRENT PRODUCT",
    step: step(7, "Check the attendance"),
    visual: "Attendance tab: names read from the sheet marked 'Needs verification'; the counts compared (8 stated, 7 names); adding the missing name; marking all rows verified; 'Reconciled'.",
    shots: ["Names marked Needs verification", "Counts differ: 8 and 7", "Add the missing name", "Mark all rows verified", "Numbers match"],
    evidence: "Rows from the sheet are saved unverified (src/lib/extraction/attendance.ts); counts compared in src/lib/reconciliation.ts; gender only as written on the sheet.",
    lines: [
      { text: "Next, the “Attendance” tab. The app has read the names from the attendance sheet." },
      { text: "Handwriting is hard for a computer to read. So every name is marked “Needs verification”, until you check it against the paper sheet." },
      { text: "At the top, the app compares the numbers. The report says eight students attended, but only seven names were read from the sheet. So it tells you that the counts differ." },
      { text: "I look at the paper sheet, and I find the missing student. I type the name, choose the gender exactly as written on the sheet, and click “Add row”." },
      { text: "After checking every name, I click “Mark all rows verified”, and confirm." },
      { text: "Now the numbers match, and the app shows the word “Reconciled”.", pause: 0.8 },
    ],
  },
  {
    id: "w09-reports",
    title: "Create the reports",
    status: "CURRENT PRODUCT",
    step: step(8, "Create the reports"),
    visual: "Reports tab: Generate reports; the three reports; the Activity Report preview with a “Not provided” detail; the Detailed Report and the Attendance Summary.",
    shots: ["Generate reports", "Three report cards", "Activity Report preview", "“Not provided”", "Detailed Report", "Attendance Summary", "Draft label"],
    evidence: "src/lib/reports/build.ts (three reports from reviewed fields, “Not provided” for missing values); DRAFT footer until approval in src/lib/server/exports.ts.",
    lines: [
      { text: "Now open the “Reports” tab, and click “Generate reports”. The app creates three documents: the Activity Report, the Detailed Report, and the Attendance Summary." },
      { text: "They are made in your department's format, using only the details you have checked." },
      { text: "Here is a preview of the Activity Report. Look at “Details of Invited Speaker”. It says “Not provided”, because this information was not in any document. You can go back to the Review tab, type it in, and generate the report again." },
      { text: "Here are the Detailed Report, and the Attendance Summary." },
      { text: "Until the report is approved, every downloaded copy is clearly marked as a draft.", pause: 0.8 },
    ],
  },
  {
    id: "w10-approve",
    title: "Approve",
    status: "CURRENT PRODUCT",
    step: step(9, "Approve"),
    visual: "Approve tab: the checklist all green; Approve; approved and locked, with the teacher's name and time.",
    shots: ["Checklist", "Approve button", "Approved and locked"],
    evidence: "approveActivity: refuses while any blocking issue remains; records approver and time; activity becomes read-only.",
    lines: [
      { text: "When everything is checked, open the “Approve” tab. This checklist shows that every check has passed." },
      { text: "Only a teacher can approve. The app never approves anything on its own. Click “Approve”." },
      { text: "The report is now approved, and locked. Your name, and the date and time of approval, are recorded.", pause: 0.8 },
    ],
  },
  {
    id: "w11-download",
    title: "Download and print",
    status: "CURRENT PRODUCT",
    step: step(10, "Download and print"),
    visual: "Reports tab after approval: Word and PDF downloads, the complete packet.",
    shots: ["Word file", "PDF", "Complete packet"],
    evidence: "Exports: DOCX and PDF per report, packet PDF and evidence ZIP built in the browser; signature spaces left blank.",
    lines: [
      { text: "Now, download your files. Use the Word file if you want to make small changes before printing, or the PDF to print it directly." },
      { text: "You can also download one complete packet, with the reports and all the documents together. The signature spaces are left blank, so they can be signed by hand.", pause: 0.8 },
    ],
  },
  {
    id: "w12-history",
    title: "History",
    status: "CURRENT PRODUCT",
    step: step(11, "History"),
    visual: "Audit tab: the timeline of everything that happened.",
    shots: ["History timeline"],
    lines: [
      { text: "The “Audit” tab keeps a history of everything that happened: every upload, every check, every decision, and the approval, with who did it, and when.", pause: 0.8 },
    ],
  },
  {
    id: "w13-feedback",
    title: "Tell us what you think",
    status: "CURRENT PRODUCT",
    step: step(12, "Tell us what you think"),
    visual: "Feedback form on the approved activity, filled in and saved; then the administrator's Pilot page (counts only).",
    shots: ["Feedback form", "Saved", "Administrator's Pilot page"],
    evidence: "db/migrations/002_feedback.sql; src/lib/server/feedback.ts; /pilot (administrators only).",
    lines: [
      { text: "After approval, the app asks for your feedback. You give a rating from one to five, write what worked well and what was difficult, and answer three short questions." },
      { text: "Your answers help us decide what to improve. Only the administrators can see them." },
      { text: "Administrators see all the answers on one page, together with simple counts from the app, such as how many activities were completed.", pause: 0.8 },
    ],
  },
  {
    id: "g08-recap",
    title: "Recap",
    status: "CURRENT PRODUCT",
    visual: "Four steps in a row: You upload → The app fills in, with sources → You check and decide → You approve and download.",
    shots: ["Recap flow"],
    lines: [
      { text: "So, to recap. You upload your documents. The app fills in the details, and shows where each one came from. You check, and you decide. And you approve." },
      { text: "The app saves you the copying and the searching. But you stay in control of what goes into every report.", pause: 1 },
    ],
  },
  {
    id: "g09-future",
    title: "What we plan next",
    status: "FUTURE ROADMAP",
    visual: "“Future roadmap · not built yet”. Planned helpers appear one by one, with faculty approval at the end.",
    shots: ["Built today", "Coordinator (planned)", "Document helper", "Checking helper", "Disagreement helper", "Report helper", "Follow-up helper", "Teacher approval"],
    lines: [
      { text: "What you have seen is what the app does today." },
      { text: "In the future, we plan to add more helpers, sometimes called agents. These are not built yet." },
      { text: "For example: a helper that collects the right documents for you, one that checks the details against college rules, one that prepares disagreements for you to decide, one that drafts the reports, and one that reminds you about missing documents. A coordinator would keep them working together." },
      { text: "Even then, the teacher will always give the final approval." },
      { text: "We will only build these after learning from real teachers who use the app today.", pause: 1 },
    ],
  },
  {
    id: "g10-pilot",
    title: "The pilot",
    status: "PILOT",
    visual: "Planned pilot: Mechanical Engineering, KDK College of Engineering, Nagpur. A loop: teachers use the app → finish an activity → give feedback → we find what is difficult → improve → repeat.",
    shots: ["Pilot (planned)", "Learning loop"],
    lines: [
      say("That is why we are planning a pilot with the Mechanical Engineering department of KDK College of Engineering, Nagpur.", "That is why we are planning a pilot with the Mechanical Engineering department of K D K College of Engineering, Nagpur."),
      { text: "Teachers will use the app for their real activities, and tell us what helped and what was difficult. We will improve the app, and repeat." },
      { text: "The goal is simple: to find out whether it truly saves teachers time and effort.", pause: 1 },
    ],
  },
  {
    id: "g12-closing",
    title: "Closing",
    status: "CONTEXT",
    visual: "Product name, tagline, and three rows: Today / Next (not built yet) / Pilot.",
    shots: ["College Operations Copilot", "From scattered documents to an approved report — with the teacher in control.", "Today / Next / Pilot"],
    lines: [
      { text: "College Operations Copilot. From scattered documents to an approved report, with the teacher in control." },
      { text: "Thank you for watching.", pause: 2 },
    ],
  },
];

/** 30–45 second cut for a CV or LinkedIn. */
export const SHORT: { scene: string; lines: Line[] }[] = [
  { scene: "g01-problem", lines: [{ text: "After every college activity, teachers copy details from posters, notices and attendance sheets into a report." }] },
  { scene: "w06-review", lines: [{ text: "College Operations Copilot reads those documents and fills in the report, showing where every detail came from." }] },
  { scene: "w07-conflict", lines: [{ text: "When documents disagree, it does not guess. The teacher decides." }] },
  { scene: "w08-attendance", lines: [{ text: "Handwritten attendance is checked by the teacher, name by name." }] },
  { scene: "w10-approve", lines: [{ text: "Only a teacher can approve the final report." }] },
  { scene: "g09-future", lines: [{ text: "Next: a pilot with real teachers, before building more.", pause: 0.4 }] },
  { scene: "g12-closing", lines: [{ text: "College Operations Copilot.", pause: 3.2 }] },
];
