/**
 * Deterministic field extraction. No model is involved: every candidate comes
 * from an explicit rule applied to extracted page text, and carries the rule
 * name, the page, and the exact snippet it was read from.
 *
 * Rules are intentionally conservative — when a rule is unsure it produces a
 * low-confidence candidate (which the reviewer sees) or nothing at all.
 */
import { findDates, findTimes, normalizeText, normalizeValue, textKey } from "../normalize";
import type { TemplateDefinition, TemplateField } from "../templates/schema";
import type { FieldCandidate, PageText } from "./types";

const RULE_CONFIDENCE = {
  labelSameLine: 0.9,
  labelMultiLine: 0.85,
  labelWrapped: 0.5,
  counts: 0.9,
  detailedTopic: 0.85,
  detailedBody: 0.75,
  detailedDate: 0.85,
  noticeHeaderDate: 0.85,
  noticeBodyDate: 0.8,
  noticeBodyTime: 0.8,
  noticeTitle: 0.55,
  noticeVenue: 0.6,
  attendanceDate: 0.7,
  posterDate: 0.5,
  posterTitle: 0.5,
  posterAssociation: 0.5,
} as const;

function combine(rule: number, page: PageText): number {
  const pageConf = page.method === "ocr" && page.confidence != null ? page.confidence / 100 : 1;
  return Math.round(Math.min(rule, Math.max(pageConf, 0)) * 1000) / 1000;
}

/** Strips table borders and OCR debris from the edges of a value. */
export function cleanValue(s: string): string {
  let v = s.replace(/[|‘¦]+/g, " ");
  v = v.replace(/^[\s:;,.\-_=~>]+/, "").replace(/[\s:;,_=~|]+$/, "");
  // Leading 1-character debris tokens (e.g. "j", "}") except real words a/A/I.
  v = v.replace(/^(?:[^\sAaI"“‘(](?=\s))+\s*/, "");
  return v.replace(/[ \t]+/g, " ").trim();
}

function meaningful(v: string): boolean {
  return (v.match(/[A-Za-z0-9]/g) ?? []).length >= 3;
}

function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * Does compact text `c` start with compact `label`? Exact, or — for labels of
 * 5+ characters — within a small edit distance (OCR slips such as "Topie" for
 * "Topic"). Returns the number of characters of `c` consumed and whether the
 * match was fuzzy, or null.
 */
export function prefixMatch(c: string, label: string, minFuzzyLength = 5): { len: number; fuzzy: boolean } | null {
  if (c.startsWith(label)) return { len: label.length, fuzzy: false };
  const max = label.length < minFuzzyLength ? 0 : label.length >= 16 ? 2 : 1;
  if (!max) return null;
  let best: { len: number; d: number } | null = null;
  // Prefer lengths closest to the label's own length when distances tie.
  const lengths = [0, -1, 1, -2, 2].filter((d) => Math.abs(d) <= max).map((d) => label.length + d);
  for (const len of lengths) {
    if (len < 1 || len > c.length) continue;
    const d = levenshtein(c.slice(0, len), label);
    if (d <= max && (!best || d < best.d)) best = { len, d };
  }
  return best ? { len: best.len, fuzzy: true } : null;
}

/** Position in `line` just after the first `n` alphanumeric characters. */
function offsetAfterAlnum(line: string, n: number): number {
  let seen = 0;
  for (let i = 0; i < line.length; i++) {
    if (/[A-Za-z0-9]/.test(line[i])) {
      seen++;
      if (seen === n) return i + 1;
    }
  }
  return line.length;
}

interface LabelHit {
  key: string;
  fuzzy: boolean;
  /** Text after the label on this line. */
  rest: string;
  /** Label words that were not on this line (label wrapped in a table cell). */
  remainder: string[];
}

interface LabelSpec {
  key: string;
  words: string[];
}

function matchLabel(line: string, specs: LabelSpec[]): LabelHit | null {
  const c = compact(line.replace(/^[\s|‘'"]+/, ""));
  if (!c) return null;
  let best: { spec: LabelSpec; k: number; len: number; labelLen: number; fuzzy: boolean } | null = null;
  for (const spec of specs) {
    // Full label first, then shorter prefixes of at least two words (wrapped cells).
    for (let k = spec.words.length; k >= Math.min(2, spec.words.length); k--) {
      const prefix = compact(spec.words.slice(0, k).join(""));
      if (prefix.length < 5 && k < spec.words.length) break;
      // Table labels need 10+ characters before an approximate match is allowed.
      const m = prefixMatch(c, prefix, 10);
      if (m) {
        // Longest label coverage wins; an approximate match costs 3 characters.
        const score = (x: { labelLen: number; fuzzy: boolean }) => x.labelLen - (x.fuzzy ? 3 : 0);
        const better = !best || score({ labelLen: prefix.length, fuzzy: m.fuzzy }) > score(best);
        if (better) best = { spec, k, len: m.len, labelLen: prefix.length, fuzzy: m.fuzzy };
        break;
      }
    }
  }
  if (!best) return null;
  const trimmed = line.replace(/^[\s|‘'"]+/, "");
  const rest = trimmed.slice(offsetAfterAlnum(trimmed, best.len));
  return { key: best.spec.key, fuzzy: best.fuzzy, rest, remainder: best.spec.words.slice(best.k) };
}

function stripRemainder(line: string, remainder: string[]): string {
  if (!remainder.length) return line;
  const want = compact(remainder.join(""));
  const c = compact(line);
  if (c.startsWith(want)) return line.trim().slice(offsetAfterAlnum(line.trim(), want.length));
  return line;
}

/** Rows that end the current value but are not fields themselves. */
const ROW_TERMINATORS = ["No. of Students Involved"];
/** The signature table: nothing after it is a field value. */
const END_MARKERS = ["Faculty Coordinator", "Name & Signature"];

/**
 * "Label  value" pass for structured reports (table rows flattened by OCR).
 */
export function labelValueCandidates(page: PageText, def: TemplateDefinition): FieldCandidate[] {
  const specs: LabelSpec[] = [];
  for (const f of def.fields) {
    for (const alias of f.aliases) specs.push({ key: f.key, words: alias.split(/\s+/) });
  }
  const toSpecs = (key: string, labels: string[]) =>
    labels.filter(Boolean).map((t) => ({ key, words: t.split(/\s+/) }));
  const stopSpecs = [
    ...toSpecs("__row", ROW_TERMINATORS),
    ...toSpecs("__end", [...END_MARKERS, ...def.activityReport.signatories.map((s) => s.heading)]),
  ];
  // Fixed headings printed by the template are never part of a value.
  const headings = new Set(
    [def.activityReport.heading, ...def.activityReport.titleLines]
      .map((l) =>
        compact(
          l
            .replace("{institution.name}", def.institution.name)
            .replace("{institution.department}", def.institution.department)
            .replace(/\{[^}]+\}/g, ""),
        ),
      )
      .filter((c) => c.length >= 5),
  );
  const fieldByKey = new Map(def.fields.map((f) => [f.key, f]));
  const lines = page.text.split(/\r?\n/);

  type Seg = { key: string; first: string; more: string[]; orphans: string[]; remainder: string[]; line: number; fuzzy: boolean };
  const segs: Seg[] = [];
  let current: Seg | null = null;
  let orphans: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) {
      if (current && fieldByKey.get(current.key)?.type !== "longtext") current = null;
      orphans = [];
      continue;
    }
    const hit = matchLabel(raw, [...specs, ...stopSpecs]);
    if (hit?.key === "__end") break;
    if (hit?.key === "__row") {
      current = null;
      orphans = [];
      continue;
    }
    if (!hit && headings.has(compact(raw))) {
      current = null;
      continue;
    }
    if (hit) {
      current = { key: hit.key, first: hit.rest, more: [], orphans, remainder: hit.remainder, line: i, fuzzy: hit.fuzzy };
      segs.push(current);
      orphans = [];
      continue;
    }
    if (current && fieldByKey.get(current.key)?.type === "longtext") {
      let text = raw;
      if (current.remainder.length) {
        text = stripRemainder(raw, current.remainder);
        current.remainder = [];
      }
      current.more.push(text);
    } else {
      if (current) current = null;
      orphans.push(raw);
    }
  }

  const out: FieldCandidate[] = [];
  for (const seg of segs) {
    const field = fieldByKey.get(seg.key)!;
    if (field.type === "date") {
      out.push(...dateAndTimeFromLabel(seg.first, field, page, def).map((c) => (seg.fuzzy ? fuzzed(c) : c)));
      continue;
    }
    let value: string;
    let rule: string;
    let conf: number;
    const firstClean = cleanValue(seg.first);
    if (field.type === "longtext") {
      value = [firstClean, ...seg.more.map(cleanValue)].filter(Boolean).join(" ");
      rule = seg.more.length ? "label_value:multi_line" : "label_value:same_line";
      conf = seg.more.length ? RULE_CONFIDENCE.labelMultiLine : RULE_CONFIDENCE.labelSameLine;
    } else if (
      seg.orphans.length &&
      seg.orphans.length <= 2 &&
      field.type === "text" &&
      firstClean &&
      endsMidPhrase(seg.orphans[seg.orphans.length - 1])
    ) {
      // Value text vertically centred in a table cell: part of it printed
      // above the label. Reassembled, but flagged low confidence.
      value = cleanValue([...seg.orphans.map(cleanValue), firstClean].join(" "));
      rule = "label_value:wrapped_cell";
      conf = RULE_CONFIDENCE.labelWrapped;
    } else {
      value = firstClean;
      rule = "label_value:same_line";
      conf = RULE_CONFIDENCE.labelSameLine;
    }
    value = normalizeText(value);
    if (!meaningful(value)) continue;
    const norm = normalizeValue(field.type, value);
    if (!norm.ok) continue;
    const snippet = [...(rule === "label_value:wrapped_cell" ? seg.orphans : []), lines[seg.line], ...seg.more]
      .join("\n")
      .slice(0, 1200);
    const cand: FieldCandidate = {
      fieldKey: field.key,
      value: norm.value,
      normalized: field.type === "text" || field.type === "longtext" ? textKey(norm.value) : norm.value,
      sourceId: page.sourceId,
      page: page.page,
      confidence: combine(conf, page),
      method: "deterministic_parser",
      rule,
      snippet,
    };
    out.push(seg.fuzzy ? fuzzed(cand) : cand);
  }
  out.push(...countCandidates(page, def));
  return out;
}

/** A label matched only approximately: lower confidence, marked in the rule. */
function fuzzed(c: FieldCandidate): FieldCandidate {
  return { ...c, rule: `${c.rule}:fuzzy_label`, confidence: Math.round(Math.min(c.confidence, 0.75) * 1000) / 1000 };
}

/** True when a line visibly continues on the next line ("...on the occasion of"). */
function endsMidPhrase(line: string): boolean {
  const last = line.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  return /^(of|the|and|on|in|for|to|a|an|by|at|with|from)$/.test(last);
}

function dateAndTimeFromLabel(
  rest: string,
  field: TemplateField,
  page: PageText,
  def: TemplateDefinition,
): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  const order = def.dateFormat === "MM/DD/YYYY" ? "MDY" : "DMY";
  const dates = findDates(rest, order);
  if (dates.length) {
    out.push(candidate(field.key, dates[0].iso, page, RULE_CONFIDENCE.labelSameLine, "label_value:date", rest));
  }
  // "Date of Activity 06/11/2024 Time: 01.30 pm" carries the time on the same row.
  const timeField = def.fields.find((f) => f.type === "time");
  if (timeField) {
    const t = findTimes(rest.replace(dates[0]?.match ?? "", " "));
    if (t.length) out.push(candidate(timeField.key, t[0].hhmm, page, RULE_CONFIDENCE.labelSameLine, "label_value:time", rest));
  }
  return out;
}

function candidate(
  fieldKey: string,
  value: string,
  page: PageText,
  ruleConf: number,
  rule: string,
  snippet: string,
  isText = false,
): FieldCandidate {
  return {
    fieldKey,
    value,
    normalized: isText ? textKey(value) : value,
    sourceId: page.sourceId,
    page: page.page,
    confidence: combine(ruleConf, page),
    method: "deterministic_parser",
    rule,
    snippet: snippet.trim().slice(0, 1200),
  };
}

/** "Male: 39   Female: 07   Total: 46" */
export function countCandidates(page: PageText, def: TemplateDefinition): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  const { maleField, femaleField, totalField } = def.attendance;
  for (const line of page.text.split(/\r?\n/)) {
    const male = /\bmale\s*[:\-]?\s*[_\s]*(\d{1,4})\b/i.exec(line.replace(/female/gi, "      "));
    const female = /\bfemale\s*[:\-]?\s*[_\s]*(\d{1,4})\b/i.exec(line);
    const total = /\btotal\s*[:\-]?\s*[_\s]*(\d{1,4})\b/i.exec(line);
    if (!male && !female && !total) continue;
    if ([male, female, total].filter(Boolean).length < 2) continue;
    if (male) out.push(candidate(maleField, String(Number(male[1])), page, RULE_CONFIDENCE.counts, "counts:male", line));
    if (female) out.push(candidate(femaleField, String(Number(female[1])), page, RULE_CONFIDENCE.counts, "counts:female", line));
    if (total) out.push(candidate(totalField, String(Number(total[1])), page, RULE_CONFIDENCE.counts, "counts:total", line));
  }
  return out;
}

function paragraphs(lines: string[]): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}

const HEADER_DATE = /^\s*date\s*[:\-.]+\s*(.+)$/i;

/** Narrative "REPORT" documents: Topic, body, Impact Analysis, date line. */
export function detailedReportCandidates(page: PageText, def: TemplateDefinition): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  const dr = def.detailedReport;
  const order = def.dateFormat === "MM/DD/YYYY" ? "MDY" : "DMY";
  const lines = page.text.split(/\r?\n/);
  const topicKey = compact(dr.topicLabel);
  const impactKey = compact(dr.impactHeading);

  const topicIdx = lines.findIndex((l) => prefixMatch(compact(l), topicKey) != null);
  const impactIdx = lines.findIndex((l) => prefixMatch(compact(l), impactKey) != null);
  const topicLen = topicIdx >= 0 ? prefixMatch(compact(lines[topicIdx]), topicKey)!.len : 0;
  const impactLen = impactIdx >= 0 ? prefixMatch(compact(lines[impactIdx]), impactKey)!.len : 0;

  for (let i = 0; i < (topicIdx >= 0 ? topicIdx : lines.length); i++) {
    const m = HEADER_DATE.exec(lines[i]);
    if (m) {
      const d = findDates(m[1], order);
      if (d.length) out.push(candidate("report_date", d[0].iso, page, RULE_CONFIDENCE.detailedDate, "detailed:date_line", lines[i]));
      break;
    }
  }

  if (topicIdx >= 0) {
    const after = lines.slice(topicIdx);
    const paras = paragraphs(after);
    const topicPara = paras[0] ?? [];
    const first = topicPara[0] ?? "";
    const topic = cleanValue([first.slice(offsetAfterAlnum(first, topicLen)), ...topicPara.slice(1)].join(" "));
    if (meaningful(topic)) {
      out.push(candidate(dr.topicField, normalizeText(topic), page, RULE_CONFIDENCE.detailedTopic, "detailed:topic", topicPara.join("\n"), true));
    }
    const bodyEnd = impactIdx > topicIdx ? impactIdx : lines.length;
    const bodyLines = lines.slice(topicIdx + topicPara.length, bodyEnd);
    const body = paragraphs(bodyLines).map((p) => p.map((l) => l.trim()).join(" ")).join("\n\n").trim();
    if (impactIdx > topicIdx && meaningful(body)) {
      out.push(candidate(dr.descriptionField, body, page, RULE_CONFIDENCE.detailedBody, "detailed:body", body, true));
      const when = findDates(body, order);
      if (when.length) {
        out.push(candidate("activity_date", when[0].iso, page, RULE_CONFIDENCE.detailedBody, "detailed:body_date", sentenceAround(body, when[0].index)));
        const t = findTimes(body.slice(when[0].index, when[0].index + 60));
        if (t.length) out.push(candidate("activity_time", t[0].hhmm, page, RULE_CONFIDENCE.detailedBody, "detailed:body_time", sentenceAround(body, when[0].index)));
      }
    }
  }
  if (impactIdx >= 0) {
    const rest = lines.slice(impactIdx);
    const sameLine = cleanValue(rest[0].slice(offsetAfterAlnum(rest[0], impactLen)));
    const paras = paragraphs(rest.slice(1));
    const impact = [sameLine, ...(paras[0] ?? []).map((l) => l.trim())].filter(Boolean).join(" ");
    if (meaningful(impact)) {
      out.push(candidate(dr.impactField, normalizeText(impact), page, RULE_CONFIDENCE.detailedBody, "detailed:impact", impact, true));
    }
  }
  return out;
}

function sentenceAround(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index - 1) + 1);
  const endDot = text.indexOf(".", index + 12);
  return text.slice(start, endDot > 0 ? endDot + 1 : index + 120).trim();
}

const VENUE =
  /\b(?:in|at)\s+((?:the\s+)?(?:[A-Za-z0-9\-]+\s+){0,3}?(?:classroom|class room|seminar hall|hall|auditorium|laboratory|lab|room)\b(?:\s+[A-Z]{0,2}-?\d{1,4})?)/i;

/** Circulated notices: header date (issue date) vs the activity date in the body. */
export function noticeCandidates(page: PageText, def: TemplateDefinition): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  const order = def.dateFormat === "MM/DD/YYYY" ? "MDY" : "DMY";
  const lines = page.text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => HEADER_DATE.test(l));
  if (headerIdx >= 0) {
    const d = findDates(HEADER_DATE.exec(lines[headerIdx])![1], order);
    if (d.length) out.push(candidate("notice_date", d[0].iso, page, RULE_CONFIDENCE.noticeHeaderDate, "notice:header_date", lines[headerIdx]));
  }
  const noticeIdx = lines.findIndex((l) => /^\s*notice\s*$/i.test(l));
  const bodyStart = noticeIdx >= 0 ? noticeIdx + 1 : headerIdx >= 0 ? headerIdx + 1 : 0;
  // The notice sentence may be split by blank lines in OCR output; read
  // paragraphs up to the signature block.
  const bodyParts: string[] = [];
  for (const para of paragraphs(lines.slice(bodyStart))) {
    if (para.some((l) => /co-?ordinator|\bhead\b|principal|signature/i.test(l))) break;
    const joined = para.join(" ");
    if ((joined.match(/[A-Za-z0-9]/g) ?? []).length < 20) continue;
    bodyParts.push(joined);
  }
  const body = normalizeText(bodyParts.join(" "));
  if (!body) return out;

  const onDate = /\bon\s+(?=(.{0,40}))/gi;
  for (const m of body.matchAll(onDate)) {
    const d = findDates(m[1], order);
    if (d.length && d[0].index === 0) {
      out.push(candidate("activity_date", d[0].iso, page, RULE_CONFIDENCE.noticeBodyDate, "notice:body_on_date", sentenceAround(body, m.index ?? 0)));
      break;
    }
  }
  const t = findTimes(body);
  if (t.length) out.push(candidate("activity_time", t[0].hhmm, page, RULE_CONFIDENCE.noticeBodyTime, "notice:body_time", sentenceAround(body, t[0].index)));
  const venue = VENUE.exec(body);
  if (venue) {
    const v = cleanValue(venue[1]);
    if (meaningful(v)) out.push(candidate("venue", v, page, RULE_CONFIDENCE.noticeVenue, "notice:body_venue", sentenceAround(body, venue.index), true));
  }
  const quoted = /[“"]([^”"]{3,120})[”"]/.exec(body);
  if (quoted) {
    out.push(candidate("title", normalizeText(quoted[1]), page, RULE_CONFIDENCE.noticeTitle, "notice:first_quoted_phrase", sentenceAround(body, quoted.index), true));
  }
  return out;
}

export function attendanceHeaderCandidates(page: PageText, def: TemplateDefinition): FieldCandidate[] {
  const order = def.dateFormat === "MM/DD/YYYY" ? "MDY" : "DMY";
  for (const line of page.text.split(/\r?\n/)) {
    const m = HEADER_DATE.exec(line);
    if (m) {
      const d = findDates(m[1], order);
      if (d.length) return [candidate("activity_date", d[0].iso, page, RULE_CONFIDENCE.attendanceDate, "attendance:sheet_date", line)];
    }
  }
  return [];
}

/**
 * Posters: dates printed on a poster are often the commemorated day rather
 * than the activity date, so they are low-confidence and will surface as a
 * conflict for the reviewer instead of being trusted.
 */
export function posterCandidates(page: PageText, def: TemplateDefinition): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  const order = def.dateFormat === "MM/DD/YYYY" ? "MDY" : "DMY";
  const lines = page.text.split(/\r?\n/).map((l) => l.trim());
  for (const d of findDates(page.text, order)) {
    out.push(candidate("activity_date", d.iso, page, RULE_CONFIDENCE.posterDate, "poster:printed_date", d.match));
  }
  const orgIdx = lines.findIndex((l) => /^(organi[sz]es|presents|invites you to)$/i.test(l));
  if (orgIdx >= 0) {
    const next = lines.slice(orgIdx + 1).find((l) => meaningful(l));
    if (next) out.push(candidate("title", cleanValue(next), page, RULE_CONFIDENCE.posterTitle, "poster:line_after_organizes", `${lines[orgIdx]}\n${next}`, true));
  }
  for (const l of lines) {
    const m = /in collaboration with\s+(.+)$/i.exec(l);
    if (m) {
      const v = cleanValue(m[1]);
      if (meaningful(v)) out.push(candidate("association", v, page, RULE_CONFIDENCE.posterAssociation, "poster:in_collaboration_with", l, true));
      break;
    }
  }
  return out;
}

/** Runs every rule that applies to the page's document kind. */
export function extractCandidates(pages: PageText[], def: TemplateDefinition): FieldCandidate[] {
  const known = new Set(def.fields.map((f) => f.key));
  const out: FieldCandidate[] = [];
  for (const page of pages) {
    if (!page.text.trim()) continue;
    switch (page.kind) {
      case "activity_report":
      case "supporting":
        out.push(...labelValueCandidates(page, def));
        break;
      case "detailed_report":
        out.push(...detailedReportCandidates(page, def));
        break;
      case "notice":
        out.push(...noticeCandidates(page, def));
        break;
      case "attendance":
        out.push(...attendanceHeaderCandidates(page, def));
        break;
      case "poster":
        out.push(...posterCandidates(page, def));
        break;
      case "photo":
        // Photographs are evidence attachments; nothing is read from them.
        break;
    }
  }
  return out.filter((c) => known.has(c.fieldKey));
}
