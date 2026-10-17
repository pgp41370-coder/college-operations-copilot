# Agent pipeline plan

Status: **steps 1–3 (Intake, Extraction, Validation) built and scored on the reference packets; steps 4–5 not started.**

The product works without any AI model. Agents are added on top of the existing
rule-based steps. The same guardrails apply to every agent:

- an agent **suggests**, a faculty member **decides**: no agent approves, resolves a
  conflict or changes a value on its own;
- every model answer must be backed by **verbatim text from the uploaded documents**,
  or it is discarded and the rule-based result stands;
- when the model and the rules disagree, the item is **flagged for review**;
- real college documents are only sent to a model running **on the local machine**
  (Ollama), never to a hosted service, unless the institution has authorised it;
- every agent is scored against the human-labelled reference packets before any
  number is quoted.

| # | Agent | Job | Builds on | Status |
|---|---|---|---|---|
| 1 | Intake | Suggest each upload's document kind; list packet documents still missing | template `packet.sections` | **Built** — `src/lib/agents/intake.ts` |
| 2 | Extraction | Fill the 22 template fields, each with a verbatim quote + page | `OpenAICompatibleProvider.extractFields` (exists, off by default) | **Scored** — `scripts/agents/eval-extraction.ts` |
| 3 | Validation | Explain cross-document conflicts with their sources; warn when a value's quote states a different field; never pick a winner | `readiness.ts`, `reconciliation.ts` | **Scored** — `src/lib/agents/validation.ts` (not yet shown in the app) |
| 4 | Drafting | Draft narrative paragraphs only from approved fields, each sentence linked to its field | `reports/build.ts` | Planned |
| 5 | Orchestrator | Run 1→4, keep per-activity state, route uncertain items to a person | — | Planned |

## Evaluation

`npx tsx scripts/agents/eval-intake.ts` scores the Intake agent against the 18
labelled pages of the two KDK reference packets (local only; prints kinds, never
page text).

| Run | Pages | Correct | Note |
|---|---|---|---|
| Rules only (2026-10-17) | 18 | 17 (94%) | **In-sample**: the rules were written while looking at these pages. One supporting page is read as a poster. |
| Rules + qwen2.5:7b, run 1 (2026-10-17) | 18 | model 13 (72%), final 15 (83%) | 2 model quotes not found on the page (rejected). Detailed reports read as activity reports. 6 flagged for review; **0 wrong answers left unflagged**. |
| Rules + qwen2.5:7b, run 2 (2026-10-17) | 18 | model 14 (78%), final 15 (83%) | Clearer form-vs-paragraph descriptions and a word-for-word quote rule. Still in-sample. 5 flagged; **0 wrong unflagged**. Median 7.2 s/page on a MacBook Air M1. |

The final answer currently prefers the grounded model answer and flags any
disagreement. The remaining model errors (detailed report read as an activity
report; one supporting page read as an activity report) are all flagged, so a
person sees them. No further prompt changes were made against these pages, to
avoid fitting the prompt to the test set.

Two packets from one department are too few for a fair score. Before quoting any
accuracy, add held-out packets (other activities, other departments) that were
labelled by a person and never used while writing the rules or prompts.

### Extraction (step 2)

`npx tsx scripts/agents/eval-extraction.ts` (needs the model env vars) scores 11
fields per packet — 22 in all — against the values a person read from the
printed reports (the answer key in `tests/reference/kdk-cases.test.ts`). For the
activity date the reports and posters disagree, so flagging the conflict counts
as correct; for the invited speaker the reports print only dashes, so any value
counts as invented.

| Run (2026-10-17, qwen2.5:7b, local) | Correct | Missed | Wrong | Invented |
|---|---|---|---|---|
| Rules only (**in-sample**) | 22/22 (20 values + 2 conflicts flagged) | 0 | 0 | 0 |
| Model only | 18/22 (16 + 2 flagged) | 3 (one packet's participant counts) | 1 (a notice date) | 0 |
| Rules + model (as the app combines them) | 22/22 (19 + 3 flagged) | 0 | 0 | 0 |

Speed-up runs (2026-10-18, same packets, same model):

| Version | Model alone | Combined | Quote check rejected | Wrong-field values accepted | Median / document |
|---|---|---|---|---|---|
| Run 1: every document asked all 22 fields | 18/22 | 22/22 | 17 | 8 | 81 s |
| Run 2: each document asked only fields its kind can state | 13/22 | 22/22 | 17 | 10 | 56 s |
| **Run 3 (current):** run 2 + quotes ≤ 12 words + narrative only where the rules found none | 13/22 | 22/22 | 12 | 7 | **51 s** |

What we learned:
- Speed on a MacBook Air M1 is set by output length: the model reads ~70 tokens/s but writes
  ~10 tokens/s. Shorter answers are the only lever; 51 s/document is still too slow to wait for,
  so extraction should run as a background job after upload.
- From run 2 on, the model skips the participant counts (both packets) and the notice dates, even
  though they are asked. Asked for only the 3 counts, it finds them in ~18 s. Asking in groups of 5
  fields did **not** fix this and was removed. Two packets are too few to tell whether the drop
  from run 1 is the change or run-to-run variation.
- Combined accuracy stayed 22/22 with 0 wrong and 0 invented in every run: the rules cover these
  layouts, and every model error became a flagged conflict or was rejected.
- No further prompt changes were made against these packets.

- The quote check rejected 17 of 64 model values (quote not on the page, or value not in the quote).
- 8 accepted model values were still wrong for their field: the quote was real, but it belonged to a
  different field (e.g. a date that is not the notice date). The quote check cannot catch this. In
  the combined run these surface as conflicts for a person, not as wrong values — one field
  (a notice date) became a flagged conflict because of it.
- On these packets the model adds nothing over the rules. Whether it helps on layouts the rules
  have never seen is **untested** — that needs held-out packets.

### Validation (step 3)

`npx tsx scripts/agents/eval-validation.ts` checks every date/time/count candidate (rules +
model) of the answer-key fields, then plants errors: real candidates re-filed under a different
field of the same type (real quote, wrong field).

| Run (2026-10-18, qwen2.5:7b) | Result |
|---|---|
| Conflict explanation (no model) | Both packets: "06/11 (notice, activity report, detailed report, 2 attendance pages) vs 31/10 (poster)" — correct |
| Real candidates | 40, all correct (step 2's per-kind rule already removed the wrong-field values); agent wrongly warned on **5/40** (12.5%) |
| Planted wrong-field values | 20: agent warned on **7** (35%) |
| Planted, step 2 rule + agent | **15/20** (75%): the per-kind rule alone stops the 8 planted notice dates taken from posters, reports and attendance sheets; the agent missed all 8 |

Verdict: the conflict explanation is ready to show. The model's role check is too weak on a 7B
local model to rely on — keep it as an advisory warning at most, or re-test with a stronger model.
