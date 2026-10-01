# Pilot feedback

How feedback is collected during the pilot, what is stored, and what the pilot metrics mean.

## When it is asked for

Once an activity is **approved**, its Approve tab shows a short form, "How was your experience?". It is asked once per person per activity. The person can edit their answer later; the latest answer is kept. Feedback cannot be given before approval, because the questions are about the finished activity.

## Questions

| Question | Answer | Required |
|---|---|---|
| Overall rating | 1–5 stars | Yes |
| What worked well? | Free text, up to 2,000 characters | No |
| What was difficult? | Free text, up to 2,000 characters | No |
| Did the generated report require corrections? | No corrections · Minor corrections · Major corrections | Yes |
| How much manual work did you still need to do? | Very little · Some · Most of it | Yes |
| Would you use this for your next activity? | Yes · Maybe · No | Yes |

## Storage

- Table `activity_feedback` (`db/migrations/002_feedback.sql`): activity, user, the answers above, created and updated times. One row per (activity, user).
- Deleting an activity deletes its feedback. If a user account is removed, the response stays without a name.
- The audit log records `feedback.submitted` / `feedback.updated` with the rating and the three choices only. Free-text comments are not copied into the audit log.
- Only the person who wrote it, and administrators, can read a response. Responses are not public.

## Voice feedback

**Not implemented.** No audio is recorded or stored. If it is added later, it must:

- record only after explicit consent, with a visible recording indicator;
- allow stop and cancel, and ask for confirmation before submitting;
- store recordings privately with a fixed retention period, never permanently by default;
- let the person delete their recording;
- never expose recordings publicly.

## Pilot metrics (administrators: Pilot page)

All numbers are counted from the database at the moment the page is opened. Nothing is estimated or projected.

| Metric | How it is counted |
|---|---|
| Users | Accounts, excluding test accounts. Also: accounts with at least one activity, active accounts. |
| Activities processed | Activities created; of which approved. |
| Documents processed | Uploaded documents; pages with extracted text. |
| Reports generated | Generated report versions (all three report types, every regeneration). |
| Reports requiring correction | Feedback answers "Minor" / "Major corrections". |
| Conflicts detected | Fields where two or more source documents gave different values. Also: conflicts resolved by a reviewer choosing a value (from the audit log). |
| Average rating | Mean of the 1–5 ratings, with the number of responses. |
| Repeat usage | Users with two or more activities; "Would you use this again?" answers. |
| Feedback themes | Read from the comments by a person. The app does not generate or classify themes. |

**Excluded from every metric:** accounts on the reserved `.invalid` domain (the production smoke test and the demo-video recorder create these) and activities whose title starts with `[SMOKE TEST]`.

## Using the feedback

1. After each pilot activity, read new responses on the Pilot page.
2. Group comments into themes by hand (for example: OCR of handwriting, field labels, report wording).
3. Pick the friction to fix next, change the product, and check whether the next responses change.
