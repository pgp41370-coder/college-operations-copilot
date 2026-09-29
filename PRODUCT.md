# Product

**Working name:** College Operations Copilot
**First workflow:** Activity Documentation Automation
**Pilot:** Department of Mechanical Engineering, K.D.K. College of Engineering, Nagpur

## Evidence for the problem

### Faculty workflow discovery survey

The survey had 5 responses, all collected on 28 Sep 2026. The raw file is in `reference-data/` and is not committed. It contains no contact details. Only aggregate counts are reported here.

**Respondents.** All 5 are Assistant Professors:

- Department / area: "Mechanical" or "Mechanical Engineering" (3); "Engineering" (2).
- Years in academia: 2 × more than 20, 2 × 11–20, 1 × 6–10.

**What they said.**

- **Recent real example of excess effort:** 4 of 5 described activity or event report generation. 1 described answer-sheet evaluation.
- **The one frustration they would eliminate:** 3 of 5 named activity report or report generation. The other 2 named attendance and answer-sheet evaluation, and repetitive SOP-less work.
- **How burdensome the main task is (1–5):** 4, 4, 5, 5, 4.
- **Share of administrative work that is repetitive:** 3 × 51–75%, 1 × more than 75%, 1 × 26–50%.
- **Willing to test a prototype:** 4 Yes, 1 Maybe.

This is a small, self-selected sample from one institution. It supports choosing activity documentation as the first workflow. It is not a market-size claim.

### Reference activity packets

There are two packets: Rashtriya Ekta Diwas Essay Writing Competition, and the Oath. Each is one compiled PDF containing:

1. poster
2. notice
3. structured **Activity Report** (table)
4. narrative **REPORT** (Topic, body, Impact Analysis)
5. handwritten attendance sheet
6. GPS-stamped photographs
7. essay samples (Essay packet only)

What the packets show:

- **The same facts are typed several times.** Title, date, time and counts appear on the notice, the activity report, the narrative report and the attendance sheet.
- **The documents disagree.**
  - The posters print 31 Oct 2024 (the commemorated day). The notices and reports give 06/11/2024 as the activity date.
  - The Oath notice is dated 05/11/2024, which is its issue date.
- **The stated counts can't be checked by eye.**
  - The printed counts are Essay M39/F7/T46 and Oath M38/F7/T45.
  - The attendance sheets are handwritten. They contain blank numbered rows and extra rows added without numbers, so checking the counts against them is tedious.
- **The narrative sections reuse the same text.** The narrative report's body largely repeats the Objectives field, and its Impact Analysis repeats Outcomes.

These observations shaped the product:

- conflict detection instead of auto-picking a value;
- reconciliation that never silently corrects;
- a detailed-report draft built only from existing fields;
- attendance treated as a draft that needs review.

## Users

- **Faculty (coordinator).** Creates activities, uploads evidence, reviews, generates reports and approves their own activities.
- **Administrator.** Sees all activities, manages users and templates, and can reopen approved activities.

## Out of scope for the MVP

- Knowledge-agent Q&A over the academic calendar and timetable.
- ERP or portal integrations.
- Email or WhatsApp notifications.
- Committee or department sharing.
- Digital signatures.
