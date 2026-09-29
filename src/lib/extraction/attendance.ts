/**
 * Attendance sheet rows from OCR text.
 *
 * Attendance sheets in the pilot are handwritten, so OCR output is a draft
 * only: every OCR row is stored unverified and must be checked by the
 * reviewer. Gender is taken ONLY from what is written in the gender column
 * (exact or near-exact spelling of male/female/M/F). It is never guessed
 * from a student's name. Signatures are not assessed from OCR text.
 */
import type { PageText } from "./types";

export type Gender = "male" | "female" | "unspecified";

export interface AttendanceRowDraft {
  sourceId: string;
  page: number;
  serialNo: number;
  studentName: string;
  gender: Gender;
  genderRaw: string | null;
  confidence: number;
  issues: string[];
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/** Reads a gender cell token. Returns exact match, a near miss (OCR slip), or nothing. */
export function readGenderToken(token: string): { gender: Gender; exact: boolean } | null {
  // "M." / "F." inside a name is a middle initial, not a gender cell.
  if (/^[a-z]\.$/i.test(token.trim())) return null;
  const t = token.toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return null;
  if (t === "male" || t === "m") return { gender: "male", exact: true };
  if (t === "female" || t === "f") return { gender: "female", exact: true };
  if (t.length >= 5 && t.length <= 7 && t.startsWith("fe") && lev(t, "female") <= 2) {
    return { gender: "female", exact: false };
  }
  if (t.length >= 3 && t.length <= 5 && t.startsWith("m") && lev(t, "male") <= 1) {
    return { gender: "male", exact: false };
  }
  return null;
}

const ROW = /^\s*[|\[({]?\s*(\d{1,3})\s*[|\])}.,_:\-]*\s+(.+)$/;

export function parseAttendanceRows(page: PageText): AttendanceRowDraft[] {
  const rows: AttendanceRowDraft[] = [];
  const ocrConf = page.method === "ocr" && page.confidence != null ? page.confidence / 100 : 1;
  for (const line of page.text.split(/\r?\n/)) {
    const m = ROW.exec(line);
    if (!m) continue;
    const serial = Number(m[1]);
    if (serial < 1 || serial > 500) continue;
    const tokens = m[2].split(/\s+/).filter(Boolean);
    // Header rows ("Sr. No. Name of Student Gender ...") are skipped.
    if (/name of student/i.test(m[2])) continue;

    let gender: Gender = "unspecified";
    let genderRaw: string | null = null;
    let genderIdx = -1;
    let exact = false;
    // Gender column is after the name; scan right-to-left, skipping the
    // signature column (last token or two).
    for (let i = tokens.length - 1; i >= 1; i--) {
      const g = readGenderToken(tokens[i]);
      if (g) {
        gender = g.gender;
        exact = g.exact;
        genderRaw = tokens[i];
        genderIdx = i;
        break;
      }
      // Some sheets split "fe male" or "m ale".
      if (i >= 2) {
        const joined = readGenderToken(tokens[i - 1] + tokens[i]);
        if (joined && joined.exact) {
          gender = joined.gender;
          exact = true;
          genderRaw = `${tokens[i - 1]} ${tokens[i]}`;
          genderIdx = i - 1;
          break;
        }
      }
    }
    const nameTokens = genderIdx > 0 ? tokens.slice(0, genderIdx) : tokens;
    const studentName = nameTokens
      .join(" ")
      .replace(/[|{}\[\]_=~]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if ((studentName.match(/[A-Za-z]/g) ?? []).length < 3) continue;

    const issues: string[] = ["OCR draft — verify name against the sheet"];
    if (gender === "unspecified") issues.push("Gender not readable — enter manually if written on the sheet");
    else if (!exact) issues.push(`Gender read from "${genderRaw}" (possible OCR error)`);
    const conf = Math.min(ocrConf, exact ? 0.6 : gender === "unspecified" ? 0.3 : 0.45);
    rows.push({
      sourceId: page.sourceId,
      page: page.page,
      serialNo: serial,
      studentName,
      gender,
      genderRaw,
      confidence: Math.round(conf * 1000) / 1000,
      issues,
    });
  }
  return rows;
}

/** Duplicate serial numbers within one source usually mean an OCR misread. */
export function flagDuplicateSerials(rows: AttendanceRowDraft[]): AttendanceRowDraft[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(`${r.sourceId}:${r.serialNo}`, (counts.get(`${r.sourceId}:${r.serialNo}`) ?? 0) + 1);
  return rows.map((r) =>
    (counts.get(`${r.sourceId}:${r.serialNo}`) ?? 0) > 1
      ? { ...r, issues: [...r.issues, `Serial number ${r.serialNo} appears more than once`] }
      : r,
  );
}
