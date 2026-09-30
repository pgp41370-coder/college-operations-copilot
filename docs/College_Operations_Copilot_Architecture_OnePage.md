<div class="onepage">

# College Operations Copilot — what I built

**Activity Documentation Automation for colleges.** It turns an event's notice, attendance sheet, photographs and details into the institution's Activity Report, Detailed Report, Attendance Summary and an auditable evidence package. Every value carries its source page. Faculty review and approve. <span class="status impl">IMPLEMENTED</span> <span class="status opt">OPTIONAL · OFF</span> <span class="status future">PROPOSED</span> <span class="status human">HUMAN</span>

![Inputs → services and proposed agents → validation → human review → outputs](architecture/executive-overview.mmd){h125 legend=impl,opt,future,human,neutral}

<div class="grid2">
<div>

**Built and verified**

- Next.js + TypeScript + PostgreSQL; 21 API route files, 13 tables
- In-browser OCR (tesseract.js) and PDF text extraction
- Deterministic parser with page, snippet, rule and confidence for every value
- Conflict detection, missing-data and low-confidence gates
- Attendance reconciliation; gender never inferred from names
- DOCX / PDF / CSV exports, provenance manifest, packet PDF, ZIP
- Human-only approval, append-only audit trail
- 93 Vitest + 6 Playwright tests, including two real KDK packets

</div>
<div>

**Trust rules**

- Missing ≠ invented · Conflict ≠ auto-resolved
- OCR output ≠ verified fact · AI suggestion ≠ approved fact
- Approval blocked while any issue remains

**Status (30 Sep 2026)**

- **Live** on Vercel + Neon (free tiers); signed-in production smoke test 24/24 passed
- Proposed next: Knowledge Agent (calendar and timetable Q&amp;A), then follow-up and orchestration agents

<p class="small">A purpose-built architecture for the targeted college documentation workflow. It makes no claim that individual technologies are globally unprecedented.</p>

</div>
</div>

</div>
