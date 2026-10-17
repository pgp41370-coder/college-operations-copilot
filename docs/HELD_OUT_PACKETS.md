# Held-out packets: testing the agents on documents they have never seen

Every score in `docs/AGENTS_PLAN.md` so far comes from the two KDK packets that
were also used while writing the rules and prompts (**in-sample**). A score you
can quote needs **held-out** packets: real activity packets that nobody used
while building the agents.

## 1. What to ask for

Ask the HoD / faculty for **2–3 complete activity packets** that are *not* the
Essay Writing or Oath packets — ideally different activity types (workshop,
guest lecture, industrial visit) and, if possible, another department.

> Suggested message: "For testing the report tool, could you share 2–3 recent
> activity packets (poster/notice, activity report, attendance sheet, photos) as
> PDFs? They stay on my laptop only, are used only to measure accuracy, and are
> not uploaded to the live website."

Get permission first: packets contain student names and signatures.

## 2. Where to put them

Copy each PDF into `reference-data/` (git-ignored — never committed).

## 3. Label them (by hand, before running anything)

Create `reference-data/held-out.json`. For each packet, write what kind of
document every page is, and — optionally — the values printed in its activity
report. **Fill this in by reading the paper, not by looking at the app's output.**

```json
[
  {
    "id": "workshop",
    "file": "Robotics Workshop.pdf",
    "pages": { "1": "poster", "2": "notice", "3": "activity_report", "4": "detailed_report",
               "5": "attendance", "6": "photo", "7": "supporting" },
    "answers": {
      "title": { "includes": "Robotics" },
      "activity_date": { "equals": "2025-02-14" },
      "activity_time": { "equals": "10:00" },
      "male_count": { "equals": "41" },
      "female_count": { "equals": "9" },
      "total_count": { "equals": "50" },
      "notice_date": { "equals": "2025-02-10" },
      "invited_speaker": { "missing": true }
    }
  }
]
```

- Page kinds: `poster`, `notice`, `activity_report`, `detailed_report`,
  `attendance`, `photo`, `supporting`, or `null` for a blank page.
- Dates `YYYY-MM-DD`, times `HH:MM` (24-hour), numbers as digits.
- If the poster and the report disagree on the date, write
  `"activity_date": { "date": "<report date>", "conflictWith": "<poster date>" }`.
- Use `{ "missing": true }` when the document prints nothing (or only dashes).

## 4. Run

```bash
npx tsx scripts/agents/eval-intake.ts
```

With the local model (Ollama running, see `docs/AGENTS_PLAN.md`):

```bash
AI_PROVIDER=openai_compatible AI_BASE_URL=http://127.0.0.1:11434/v1 AI_MODEL=qwen2.5:7b npx tsx scripts/agents/eval-intake.ts
```

```bash
AI_PROVIDER=openai_compatible AI_BASE_URL=http://127.0.0.1:11434/v1 AI_MODEL=qwen2.5:7b npx tsx scripts/agents/eval-extraction.ts
```

The intake script prints a separate **HELD-OUT** line; extraction rows are marked
`(held-out)`. Only those numbers are fair to quote. Do not change rules or prompts
after looking at held-out results and then re-quote them — that makes them
in-sample again; add new packets instead.
