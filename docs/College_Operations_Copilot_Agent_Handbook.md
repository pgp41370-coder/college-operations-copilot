# College Operations Copilot — Agent Handbook

**The proposed “AI workforce”, in plain language** · Version 1.0 · 29 September 2026 · software at commit `7119b13`

> **Read this first.** Every agent in this handbook is a <span class="status future">PROPOSED AGENT</span>. None of them exists as an autonomous agent today. Each is paired with the <span class="status impl">CURRENT SOFTWARE SERVICE</span> that does the equivalent job in the implemented system: deterministic code, tested, with no AI model involved. The one AI capability that exists today is the <span class="status opt">OPTIONAL</span> LLM-assisted extraction adapter, which is off by default. <span class="status human">HUMAN</span> marks people.

## How the workforce is organised

![Agent map: proposed agents (grey dashed), grouped by responsibility, with the people who stay in control (blue). Each box names the current software counterpart.](architecture/agent-map.mmd){h120 legend=future,human}

## Six rules every agent follows

These are design rules for any future version. Rules 3 and 4 are already enforced by the current code.

1. **Agents propose; people decide.** An agent may create candidate values, draft text or message drafts. It never approves, archives, reopens or publishes anything.
2. **Same door as people.** Agents act only through the existing service functions, so validation, access control and audit logging apply to them exactly as they do to a logged-in user. Each action is logged with the agent's name, model and prompt version.
3. **No quote, no fact.** A factual value must cite a document page and a verbatim quote from it. The current `groundLlmValue` check discards anything else. <span class="status impl">ENFORCED TODAY</span>
4. **The gate is code, not an agent.** The readiness gate blocks approval while conflicts, missing required fields, unconfirmed low-confidence values, count mismatches or stale reports remain. No agent can call or skip it. <span class="status impl">ENFORCED TODAY</span>
5. **Escalate, don't guess.** Missing or contradictory evidence goes to a person with an explanation. The value stays empty.
6. **Nothing leaves the building without a person.** Emails and messages stay drafts until a human sends them.



## The people in control

<div class="card">

### 1. Founder / Administrator <span class="status human">HUMAN</span>

| | |
|---|---|
| Job | Owns the system: configures templates, creates user accounts, sets agent permissions (future), reviews the audit trail. |
| Input | Institutional policies, template wording, user list, audit reports. |
| Output | Template versions, accounts, policy decisions, reopened activities with a stated reason. |
| Tools | Templates editor, Settings → Users, Audit Log (all implemented). |
| Authority | Highest. Only role that can edit templates, manage users or reopen an approved activity. |
| Restrictions | Every action is audited; reopening requires a written reason. |
| Escalation path | Institution leadership (HoD / IQAC / Principal) for policy questions. |

</div>

<div class="card">

### 1a. Faculty reviewer / approver <span class="status human">HUMAN</span>

| | |
|---|---|
| Job | Owns each activity: uploads evidence, reviews every extracted value, resolves conflicts, verifies attendance, approves. |
| Input | Documents, the Review / Attendance / Reports screens. |
| Output | Choices, confirmations, edits (original kept), acknowledgements, approval. |
| Authority | The only person who can approve their activity (administrators can as well). Approval records `approved_by` and `approved_at`. |
| Restrictions | Cannot approve while any blocking issue exists. After approval the activity is read-only. |
| Escalation path | Administrator (for example, to reopen). |

</div>

<div class="card">

### 2. Orchestrator Agent <span class="status future">PROPOSED AGENT</span>

| | |
|---|---|
| Job | Plans the work for an activity and hands tasks to the other agents in the right order. |
| Input | Activity state, list of uploaded documents, open issues. |
| Output | A task plan and a progress summary for the faculty member. |
| Tools | Read activity state; invoke other agents. |
| Authority | Coordination only. |
| Restrictions | Cannot write field values, cannot call the approval service, cannot skip validation, reconciliation or review. |
| Escalation path | Stops and reports to the faculty member when an agent fails or evidence conflicts. |
| Current counterpart | <span class="status impl">CURRENT SOFTWARE SERVICE</span> The workflow tabs and `refreshStatus` status logic. The person drives the order today. |

</div>



## Evidence agents

<div class="card">

### 3. Intake Agent <span class="status future">PROPOSED AGENT</span>

| | |
|---|---|
| Job | Collects what is needed for the chosen template: asks for missing details and documents, and checks that nothing obvious is forgotten (for example, the attendance sheet). |
| Input | Faculty answers, uploaded files, the template's required fields. |
| Output | A draft activity and a checklist of missing evidence. |
| Tools | Read the template; create a draft activity; upload through the normal upload validation. |
| Authority | Can create a draft and attach files the user provides. |
| Restrictions | Never fills a field the user did not state; never uploads files from outside the conversation. |
| Escalation path | Asks the faculty member. |
| Current counterpart | <span class="status impl">CURRENT SOFTWARE SERVICE</span> The Create Activity form (all fields optional, nothing pre-filled) plus upload validation. |

</div>

<div class="card">

### 4. Document Understanding Agent <span class="status future">PROPOSED AGENT</span>

| | |
|---|---|
| Job | Works out what each document, or each page of a compiled scan, is: notice, poster, report, attendance sheet, photograph. |
| Input | Uploaded PDF or image. |
| Output | Page-kind proposals with a reason for each. |
| Tools | Read the file and its page text. |
| Authority | Proposals only. |
| Restrictions | Cannot reclassify a document without the user accepting; never reads facts from photographs. |
| Escalation path | Unclear pages are flagged for the user to label. |
| Current counterpart | <span class="status impl">CURRENT SOFTWARE SERVICE</span> The user picks the document kind at upload. Per-page classification is not built. |

</div>

<div class="card">

### 5. Extraction Agent (OCR / extraction) <span class="status future">PROPOSED AGENT</span>

| | |
|---|---|
| Job | Reads text (text layer or OCR) and proposes field values with evidence. |
| Input | Document pages. |
| Output | Field candidates, each with page, verbatim snippet, method, rule and confidence. |
| Tools | pdf.js, tesseract.js, deterministic parser, optionally an LLM with grounding. |
| Authority | Writes candidates only. |
| Restrictions | Every value needs a quote from the cited page. OCR values under 0.8 confidence must be confirmed. Handwritten attendance is always drafted as unverified. |
| Escalation path | Marks the extraction failed or incomplete and tells the user which pages could not be read. |
| Current counterpart | <span class="status impl">CURRENT SOFTWARE SERVICE</span> Browser extraction + deterministic parser. <span class="status opt">OPTIONAL</span> LLM-assisted extraction adapter (off by default). |

</div>



## Assurance agents

<div class="card">

### 6. Validation Agent <span class="status future">PROPOSED AGENT</span>

| | |
|---|---|
| Job | Explains each open issue in plain language and points the reviewer to the exact evidence. |
| Input | Field states, candidates, readiness issues. |
| Output | Issue explanations (“the poster shows 31 Oct, the notice and report show 6 Nov — the poster may show the commemorated day”). |
| Tools | Read-only access to fields, candidates and page text. |
| Authority | Comments only. |
| Restrictions | Cannot resolve a conflict, confirm a value or change a status. |
| Escalation path | The reviewer. |
| Current counterpart | <span class="status impl">CURRENT SOFTWARE SERVICE</span> Type normalisation, resolution rules (`fields/resolve.ts`) and the readiness gate (`readiness.ts`), with issue messages in the UI. |

</div>

<div class="card">

### 7. Reconciliation Agent <span class="status future">PROPOSED AGENT</span>

| | |
|---|---|
| Job | Helps check attendance row by row against the original sheet, and explains count mismatches. |
| Input | Attendance sheet pages, drafted rows, stated male / female / total counts. |
| Output | Suggested row corrections and a mismatch explanation. |
| Tools | Read files and rows; propose row edits. |
| Authority | Proposals only. |
| Restrictions | Never marks a row verified. Never infers gender from a name. Never changes stated counts. |
| Escalation path | The reviewer verifies rows or records a written acknowledgement. |
| Current counterpart | <span class="status impl">CURRENT SOFTWARE SERVICE</span> Reconciliation service (PASS / FAIL / UNVERIFIED / INSUFFICIENT_DATA) and the attendance review screen. |

</div>

<div class="card">

### 8. QA / Guardrail Agent (quality &amp; compliance) <span class="status future">PROPOSED AGENT</span>

| | |
|---|---|
| Job | Checks every sentence of a draft report against the evidence before the faculty member sees it. |
| Input | Draft text, fields, candidates and snippets. |
| Output | Pass, or a list of unsupported statements. |
| Tools | Read-only. |
| Authority | Can block a draft from going to review. |
| Restrictions | Cannot edit or approve. |
| Escalation path | Report Composer (redraft) and then the reviewer. |
| Current counterpart | <span class="status impl">CURRENT SOFTWARE SERVICE</span> Reports are built only from template text plus field values, so there is no free text to check. Missing values print “Not provided”. |

</div>

<div class="card">

### 9. Audit Agent <span class="status future">PROPOSED AGENT</span>

| | |
|---|---|
| Job | Summarises the history of an activity and flags unusual patterns (for example, many edits after reports were generated). |
| Input | Audit log, provenance manifest. |
| Output | A review summary for the administrator. |
| Tools | Read-only. |
| Authority | Reporting only. |
| Restrictions | Cannot edit or delete audit records (the log is append-only). |
| Escalation path | Administrator. |
| Current counterpart | <span class="status impl">CURRENT SOFTWARE SERVICE</span> Append-only `audit_logs`, the History tab, the Audit Log page and the JSON provenance manifest. |

</div>



## Output and operations agents

<div class="card">

### 10. Report Composer Agent <span class="status future">PROPOSED AGENT</span>

| | |
|---|---|
| Job | Drafts more natural wording for narrative sections, using only reviewed field values. |
| Input | Reviewed fields and the template. |
| Output | Draft narrative text, marked as a draft. |
| Tools | Read fields; write draft text. |
| Authority | Drafts only. |
| Restrictions | Cannot add facts, names, dates, counts, objectives or outcomes that are not in the fields. Every draft passes the QA / Guardrail Agent. The faculty member accepts or edits it. |
| Escalation path | Leaves the section as “Not provided” when evidence is missing. |
| Current counterpart | <span class="status impl">CURRENT SOFTWARE SERVICE</span> Deterministic report engine (`reports/build.ts`). The detailed-report draft only combines existing fields and says which ones it used. |

</div>

<div class="card">

### 11. Knowledge Agent <span class="status future">PROPOSED AGENT</span> — Phase 2

| | |
|---|---|
| Job | Answers questions such as “When are examinations?” from the academic calendar, timetable and notices. |
| Input | A question plus approved institutional documents. |
| Output | An answer with the source document and page, or “Not found in the provided documents”. |
| Tools | Read-only search over stored page text. |
| Authority | Read-only. |
| Restrictions | Only answers from uploaded, approved sources and always cites them. |
| Escalation path | Directs the user to the responsible office. |
| Current counterpart | None. The page-text storage it would search (`source_extractions`) already exists. |

</div>

<div class="card">

### 12. Follow-up Agent <span class="status future">PROPOSED AGENT</span>

| | |
|---|---|
| Job | Drafts reminders for missing evidence, unverified attendance or pending approvals. |
| Input | Open issues and activity status. |
| Output | Message drafts. |
| Tools | Draft messages only. |
| Authority | None to send. |
| Restrictions | A person reviews and sends every message. |
| Escalation path | Activity owner. |
| Current counterpart | None. The dashboard shows counts by status. |

</div>

<div class="card">

### 13. Operations Agent <span class="status future">PROPOSED AGENT</span> — Phase 5

| | |
|---|---|
| Job | Tracks recurring operational tasks across departments and produces status digests. |
| Input | Task registers and activity statuses. |
| Output | A digest for owners. |
| Tools | Read-only; drafts. |
| Authority | Reporting only. |
| Restrictions | No changes to records. |
| Escalation path | Department owners. |
| Current counterpart | None. |

</div>

<div class="page-break"></div>

## What exists today vs what is proposed

| Capability | Today | Proposed agent |
|---|---|---|
| Collect details and documents | <span class="status impl">CURRENT</span> Create Activity form, upload validation | Intake Agent |
| Identify document types | <span class="status impl">CURRENT</span> User selects the kind per upload | Document Understanding Agent |
| Read text and propose values | <span class="status impl">CURRENT</span> Browser OCR + deterministic parser · <span class="status opt">OPTIONAL</span> grounded LLM adapter | Extraction Agent |
| Detect conflicts and missing data | <span class="status impl">CURRENT</span> Resolution rules + readiness gate | Validation Agent (explains issues) |
| Check attendance and counts | <span class="status impl">CURRENT</span> Reconciliation service + review screen | Reconciliation Agent |
| Write reports | <span class="status impl">CURRENT</span> Deterministic template engine | Report Composer Agent + QA / Guardrail Agent |
| Keep an audit trail | <span class="status impl">CURRENT</span> Append-only log, manifest | Audit Agent (summaries) |
| Coordinate the steps | <span class="status impl">CURRENT</span> Workflow tabs; the person drives | Orchestrator Agent |
| Answer questions, remind, run operations | Not built | Knowledge · Follow-up · Operations Agents |
| **Approve** | <span class="status human">HUMAN</span> only, always | **No agent — by design** |

**Why agents are introduced gradually.** The trust model is already enforced in code: provenance, grounding, the gate and human approval. Each proposed agent can be added behind it one at a time, with its permissions limited to “propose”. Adding an agent therefore does not require re-proving that reports stay free of unsupported facts.

**Originality and scope.** This handbook describes a proposed agentic operating model purpose-built for college documentation operations. It does not claim that individual technologies or concepts are globally unprecedented. A novelty claim would require separate prior-art and competitive research.
