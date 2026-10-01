# Product video — narration

Generated from `scripts/video/script.ts`. Edit that file, then run `npx tsx scripts/video/docs.mts`.

- **Voice:** macOS Indian English voice (default `Aman`, alternative `Tara`), rate 160, with pauses between sentences. Set `VIDEO_VOICE` / `VIDEO_RATE` to change.
- **Audience:** teachers. Plain words, no technical terms, every screen explained. Captions are shown on screen.
- **Labels:** each scene is marked CONTEXT, CURRENT PRODUCT, FUTURE ROADMAP or PILOT. Only CURRENT PRODUCT scenes describe what the deployed app does today.
- **Order:** the live demo is split around the conflict and attendance scenes (5A → 6 → 7 → 5B) so the recording follows the real workflow order.

## The problem · `CONTEXT`

> After every college activity, whether it is a workshop, a seminar or a quiz, a teacher has to prepare an activity report.
>
> The information for that report is spread across many papers: the poster, the notice, the attendance sheet, and the photographs.
>
> Sometimes these papers do not even agree. The poster may show one date, and the notice another.
>
> So the teacher reads everything, copies the details by hand into the college format, checks them, and gets the report approved.
>
> And then does it all again, for the next activity.

## What we wanted · `CONTEXT`

> We wanted to save teachers from this repetitive work.
>
> But with one important rule: the computer must never make up information.
>
> Every detail in an official report must come from a real document, and a teacher must always have the final say.

## Introducing the app · `CURRENT PRODUCT`

> That is why we built College Operations Copilot.
>
> In this video, I will walk you through it slowly, step by step, exactly as a teacher would use it.

## How it works, in four parts · `CURRENT PRODUCT`

> The idea is simple. There are four parts.
>
> First, you upload the documents you already have.
>
> Second, the app reads them and fills in the report details for you. Next to every detail, it shows which document, and which page, it came from.
>
> Third, you check those details. You correct anything that is wrong, and you decide whenever two documents disagree.
>
> And fourth, you approve the report, and download it, ready to print and sign.
>
> If a detail is not found in any document, the app does not guess. It simply marks it as “Not provided”, so you can fill it in yourself.

Verified against: Browser text reading (src/lib/extraction/browser.ts); rules fill fields with document, page and text excerpt (field_candidates); review actions; approveActivity; NOT_PROVIDED in src/lib/reports/build.ts.

## Sign in · `CURRENT PRODUCT`

> Let us begin. This is the real app, running online. For this demonstration, I am using sample documents for a made-up event, so no real student information is shown.
>
> Your administrator creates your account. You simply enter your email and password, and click “Sign in”.

## Your dashboard · `CURRENT PRODUCT`

> This is your dashboard. It is your home page.
>
> At the top, you can see how many activities you have, and how many are waiting for your review.
>
> This is a new account, so everything is zero. To start a new activity report, click “Create Activity”.

## Create the activity · `CURRENT PRODUCT`

> This bar shows the whole journey, in seven steps, from entering the details to the final approval.
>
> You can type the details you already know, like the title or the venue. But you do not have to. You can leave everything blank, because the app will try to fill these in from your documents.
>
> Your department's report format is already selected. Click “Create and continue to evidence”.

## Upload your documents · `CURRENT PRODUCT`

> Now we upload the documents. First, choose what kind of document it is, for example, “Notice”. Then drag the file into this box, or click “browse files”.
>
> You can upload PDF files and pictures, in JPG or PNG format, up to four megabytes each.
>
> As each file is uploaded, the app reads the text inside it. A typed PDF is read almost instantly. A scanned page, or a photo of a page, takes a few seconds longer, because the app has to read the words from the picture.
>
> Here I upload the notice, the scanned activity report, the poster, and the attendance sheet.
>
> Photographs of the event are simply kept as evidence. The app does not try to read anything from them.
>
> Each document now appears in this list. You can open it, read it again, or remove it at any time.

Verified against: 4 MB limit and PDF/JPG/PNG (evidence tab and server checks); text read in the browser, PDF text first, scans read from the image; photographs stored only.

## See the summary · `CURRENT PRODUCT`

> Now open the “Overview” tab. It gives you a quick summary of every detail in the report, using colours.
>
> Blue means the detail was taken from one of your documents. Amber means, please check it, because the app was not fully sure. Red means two documents disagree. Grey means the detail was not found. And green means you have already checked it yourself.
>
> Below that, the app lists exactly what still needs your attention, before the report can be approved.

Verified against: src/lib/trust.ts (verified / source-backed / needs review / conflict / not provided); readiness issues list.

## Check each detail · `CURRENT PRODUCT`

> Now open the “Review” tab. Here, every detail of the report is listed, one by one.
>
> Look at “Category of the Activity”. The app found the word “Technical”. Just below it, you can see exactly where it came from: the scanned activity report, page one.
>
> To see the original, click “Preview source”. The page opens right beside the text the app read, so you can compare them with your own eyes.
>
> Some details are marked “Needs review”. This means the app was not fully sure of what it read. After checking it, you click “Confirm”. If it is wrong, you click “Edit”, and type the correct value.

Verified against: Review cards show value, document and page; Preview source drawer; values below 80% confidence must be confirmed (src/lib/trust.ts, readiness).

## When documents disagree · `CURRENT PRODUCT`

> Now, the most important part. Look at the “Date of Activity”. It is marked in red, because the documents disagree.
>
> The poster says the thirty-first of October. But the notice, the activity report, and the attendance sheet all say the sixth of November.
>
> The app does not pick one for you. It shows you every value, with the document it came from, and it will not let the report be approved until you decide.
>
> You know the correct date, so you choose it. Here, I click “Use this value” on the activity report. The app records that a teacher made this choice, and when.

Verified against: Conflicts are never resolved automatically and block approval (src/lib/fields/resolve.ts, src/lib/readiness.ts); the choice is recorded in the history.

## Check the attendance · `CURRENT PRODUCT`

> Next, the “Attendance” tab. The app has read the names from the attendance sheet.
>
> Handwriting is hard for a computer to read. So every name is marked “Needs verification”, until you check it against the paper sheet.
>
> At the top, the app compares the numbers. The report says eight students attended, but only seven names were read from the sheet. So it tells you that the counts differ.
>
> I look at the paper sheet, and I find the missing student. I type the name, choose the gender exactly as written on the sheet, and click “Add row”.
>
> After checking every name, I click “Mark all rows verified”, and confirm.
>
> Now the numbers match, and the app shows the word “Reconciled”.

Verified against: Rows from the sheet are saved unverified (src/lib/extraction/attendance.ts); counts compared in src/lib/reconciliation.ts; gender only as written on the sheet.

## Create the reports · `CURRENT PRODUCT`

> Now open the “Reports” tab, and click “Generate reports”. The app creates three documents: the Activity Report, the Detailed Report, and the Attendance Summary.
>
> They are made in your department's format, using only the details you have checked.
>
> Here is a preview of the Activity Report. Look at “Details of Invited Speaker”. It says “Not provided”, because this information was not in any document. You can go back to the Review tab, type it in, and generate the report again.
>
> Here are the Detailed Report, and the Attendance Summary.
>
> Until the report is approved, every downloaded copy is clearly marked as a draft.

Verified against: src/lib/reports/build.ts (three reports from reviewed fields, “Not provided” for missing values); DRAFT footer until approval in src/lib/server/exports.ts.

## Approve · `CURRENT PRODUCT`

> When everything is checked, open the “Approve” tab. This checklist shows that every check has passed.
>
> Only a teacher can approve. The app never approves anything on its own. Click “Approve”.
>
> The report is now approved, and locked. Your name, and the date and time of approval, are recorded.

Verified against: approveActivity: refuses while any blocking issue remains; records approver and time; activity becomes read-only.

## Download and print · `CURRENT PRODUCT`

> Now, download your files. Use the Word file if you want to make small changes before printing, or the PDF to print it directly.
>
> You can also download one complete packet, with the reports and all the documents together. The signature spaces are left blank, so they can be signed by hand.

Verified against: Exports: DOCX and PDF per report, packet PDF and evidence ZIP built in the browser; signature spaces left blank.

## History · `CURRENT PRODUCT`

> The “Audit” tab keeps a history of everything that happened: every upload, every check, every decision, and the approval, with who did it, and when.

## Tell us what you think · `CURRENT PRODUCT`

> After approval, the app asks for your feedback. You give a rating from one to five, write what worked well and what was difficult, and answer three short questions.
>
> Your answers help us decide what to improve. Only the administrators can see them.
>
> Administrators see all the answers on one page, together with simple counts from the app, such as how many activities were completed.

Verified against: db/migrations/002_feedback.sql; src/lib/server/feedback.ts; /pilot (administrators only).

## Recap · `CURRENT PRODUCT`

> So, to recap. You upload your documents. The app fills in the details, and shows where each one came from. You check, and you decide. And you approve.
>
> The app saves you the copying and the searching. But you stay in control of what goes into every report.

## What we plan next · `FUTURE ROADMAP`

> What you have seen is what the app does today.
>
> In the future, we plan to add more helpers, sometimes called agents. These are not built yet.
>
> For example: a helper that collects the right documents for you, one that checks the details against college rules, one that prepares disagreements for you to decide, one that drafts the reports, and one that reminds you about missing documents. A coordinator would keep them working together.
>
> Even then, the teacher will always give the final approval.
>
> We will only build these after learning from real teachers who use the app today.

## The pilot · `PILOT`

> That is why we are planning a pilot with the Mechanical Engineering department of KDK College of Engineering, Nagpur.
>
> Teachers will use the app for their real activities, and tell us what helped and what was difficult. We will improve the app, and repeat.
>
> The goal is simple: to find out whether it truly saves teachers time and effort.

## Closing · `CONTEXT`

> College Operations Copilot. From scattered documents to an approved report, with the teacher in control.
>
> Thank you for watching.

## Short version (30–45 s, for a CV or LinkedIn)

> After every college activity, teachers copy details from posters, notices and attendance sheets into a report.
>
> College Operations Copilot reads those documents and fills in the report, showing where every detail came from.
>
> When documents disagree, it does not guess. The teacher decides.
>
> Handwritten attendance is checked by the teacher, name by name.
>
> Only a teacher can approve the final report.
>
> Next: a pilot with real teachers, before building more.
>
> College Operations Copilot.


Word count: full 1493, short 73.
