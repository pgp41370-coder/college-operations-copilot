import type { FieldType } from "./templates/schema";

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9,
  sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

const MONTH_PATTERN =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export type DateOrder = "DMY" | "MDY";

/** A date found in free text, with the exact matched text for provenance. */
export interface DateMatch {
  iso: string;
  match: string;
  index: number;
}

/**
 * Finds dates written as 06/11/2024, 06-11-2024, 06.11.2024, "6th November 2024",
 * "31ST OCTOBER, 2024" or OCR variants like `6" November 2024` (superscript read
 * as a quote). Numeric dates are read in the configured order (DMY for India).
 */
export function findDates(text: string, order: DateOrder = "DMY"): DateMatch[] {
  const out: DateMatch[] = [];
  const numeric = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/g;
  for (const m of text.matchAll(numeric)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    const iso = order === "DMY" ? validDate(y, b, a) : validDate(y, a, b);
    if (iso) out.push({ iso, match: m[0], index: m.index ?? 0 });
  }
  const written = new RegExp(
    `\\b(\\d{1,2})\\s*(?:st|nd|rd|th|["'“”’])?\\s+(${MONTH_PATTERN})\\.?,?\\s*(\\d{4})\\b`,
    "gi",
  );
  for (const m of text.matchAll(written)) {
    const iso = validDate(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
    if (iso) out.push({ iso, match: m[0], index: m.index ?? 0 });
  }
  const monthFirst = new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi");
  for (const m of text.matchAll(monthFirst)) {
    const iso = validDate(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
    if (iso) out.push({ iso, match: m[0], index: m.index ?? 0 });
  }
  return out.sort((x, y) => x.index - y.index);
}

export interface TimeMatch {
  hhmm: string;
  match: string;
  index: number;
}

/** Finds times such as "01.30 pm", "1.30 pm", "1:30 PM", "13:30". */
export function findTimes(text: string): TimeMatch[] {
  const out: TimeMatch[] = [];
  const re = /\b(\d{1,2})[.:](\d{2})\s*(a\.?m\.?|p\.?m\.?)?(?![\d])/gi;
  for (const m of text.matchAll(re)) {
    let h = Number(m[1]);
    const min = Number(m[2]);
    const mer = m[3]?.replace(/\./g, "").toLowerCase();
    if (min > 59) continue;
    if (mer) {
      if (h < 1 || h > 12) continue;
      if (mer === "pm" && h !== 12) h += 12;
      if (mer === "am" && h === 12) h = 0;
    } else if (h > 23 || !m[0].includes(":")) {
      // "06.11" without am/pm is more likely part of a date; require ":" for 24h.
      continue;
    }
    out.push({ hhmm: `${pad(h)}:${pad(min)}`, match: m[0], index: m.index ?? 0 });
  }
  return out;
}

/** Collapses whitespace and unifies quotes so equal text compares equal. */
export function normalizeText(s: string): string {
  return s
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’′]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Comparison key for text candidates: case, punctuation and spacing ignored. */
export function textKey(s: string): string {
  return normalizeText(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Normalizes a user- or parser-provided value for storage.
 * Returns { ok: false } with a reason when the value cannot be interpreted —
 * the caller must surface this rather than guess.
 */
export function normalizeValue(
  type: FieldType,
  raw: string,
  order: DateOrder = "DMY",
): { ok: true; value: string } | { ok: false; reason: string } {
  const s = normalizeText(raw);
  if (!s) return { ok: false, reason: "Value is empty." };
  switch (type) {
    case "date": {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split("-").map(Number);
        const iso = validDate(y, m, d);
        return iso ? { ok: true, value: iso } : { ok: false, reason: "Not a valid calendar date." };
      }
      const found = findDates(s, order);
      if (found.length === 1) return { ok: true, value: found[0].iso };
      if (found.length > 1) return { ok: false, reason: "More than one date in value." };
      return { ok: false, reason: "Could not read a date (expected e.g. 06/11/2024)." };
    }
    case "time": {
      if (/^\d{2}:\d{2}$/.test(s)) {
        const [h, m] = s.split(":").map(Number);
        if (h <= 23 && m <= 59) return { ok: true, value: s };
      }
      const found = findTimes(s);
      if (found.length === 1) return { ok: true, value: found[0].hhmm };
      return { ok: false, reason: "Could not read a time (expected e.g. 01.30 pm)." };
    }
    case "integer": {
      if (!/^\d{1,6}$/.test(s)) return { ok: false, reason: "Expected a whole number." };
      return { ok: true, value: String(Number(s)) };
    }
    default:
      return { ok: true, value: type === "longtext" ? raw.trim().replace(/\r\n/g, "\n") : s };
  }
}

export function formatDate(iso: string, format: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  if (format === "YYYY-MM-DD") return iso;
  if (format === "MM/DD/YYYY") return `${m[2]}/${m[3]}/${m[1]}`;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** 13:30 -> "01.30 pm" (the style used in the KDK reference reports). */
export function formatTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const mer = h >= 12 ? "pm" : "am";
  h = h % 12 === 0 ? 12 : h % 12;
  return `${pad(h)}.${m[2]} ${mer}`;
}

export function formatValue(
  type: FieldType,
  value: string,
  dateFormat: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY",
): string {
  if (type === "date") return formatDate(value, dateFormat);
  if (type === "time") return formatTime(value);
  return value;
}
