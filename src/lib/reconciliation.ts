/**
 * Participant-count reconciliation.
 *
 * Compares the counts stated in the report (male/female/total fields) with
 * each other and with the attendance rows. Nothing is corrected: the result
 * only reports agreement, disagreement, or lack of data.
 */
export type CheckResult = "PASS" | "FAIL" | "INSUFFICIENT_DATA";

export interface ReconciliationCheck {
  id: "stated_sum" | "attendance_total" | "attendance_male" | "attendance_female";
  label: string;
  result: CheckResult;
  detail: string;
}

export interface AttendanceTally {
  rows: number;
  male: number;
  female: number;
  unspecified: number;
  verifiedRows: number;
}

export type OverallResult = "PASS" | "FAIL" | "UNVERIFIED" | "INSUFFICIENT_DATA";

export interface Reconciliation {
  overall: OverallResult;
  checks: ReconciliationCheck[];
  stated: { male: number | null; female: number | null; total: number | null };
  attendance: AttendanceTally;
  messages: string[];
}

export function tally(rows: { gender: string; verified: boolean }[]): AttendanceTally {
  return {
    rows: rows.length,
    male: rows.filter((r) => r.gender === "male").length,
    female: rows.filter((r) => r.gender === "female").length,
    unspecified: rows.filter((r) => r.gender !== "male" && r.gender !== "female").length,
    verifiedRows: rows.filter((r) => r.verified).length,
  };
}

function num(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  return /^\d+$/.test(v) ? Number(v) : null;
}

export function reconcile(
  stated: { male?: string | null; female?: string | null; total?: string | null },
  rows: { gender: string; verified: boolean }[],
): Reconciliation {
  const s = { male: num(stated.male), female: num(stated.female), total: num(stated.total) };
  const t = tally(rows);
  const checks: ReconciliationCheck[] = [];
  const messages: string[] = [];

  if (s.male != null && s.female != null && s.total != null) {
    const ok = s.male + s.female === s.total;
    checks.push({
      id: "stated_sum",
      label: "Stated male + female = stated total",
      result: ok ? "PASS" : "FAIL",
      detail: `${s.male} + ${s.female} = ${s.male + s.female}; stated total ${s.total}`,
    });
    if (!ok) messages.push("Participant totals do not reconcile: stated male + female does not equal stated total.");
  } else {
    checks.push({
      id: "stated_sum",
      label: "Stated male + female = stated total",
      result: "INSUFFICIENT_DATA",
      detail: "Male, female and total counts are not all available.",
    });
  }

  if (t.rows === 0) {
    checks.push({ id: "attendance_total", label: "Attendance rows = stated total", result: "INSUFFICIENT_DATA", detail: "No attendance rows recorded." });
  } else if (s.total == null) {
    checks.push({ id: "attendance_total", label: "Attendance rows = stated total", result: "INSUFFICIENT_DATA", detail: `${t.rows} attendance rows; no stated total.` });
  } else {
    const ok = t.rows === s.total;
    checks.push({
      id: "attendance_total",
      label: "Attendance rows = stated total",
      result: ok ? "PASS" : "FAIL",
      detail: `${t.rows} attendance rows; stated total ${s.total}`,
    });
    if (!ok) messages.push(`Participant-count mismatch detected: ${t.rows} attendance rows vs stated total ${s.total}.`);
  }

  for (const g of ["male", "female"] as const) {
    const id = g === "male" ? "attendance_male" : "attendance_female";
    const label = `Attendance ${g} = stated ${g}`;
    const stated = s[g];
    if (t.rows === 0 || stated == null) {
      checks.push({ id, label, result: "INSUFFICIENT_DATA", detail: "Not enough data." });
    } else if (t.unspecified > 0) {
      checks.push({
        id,
        label,
        result: "INSUFFICIENT_DATA",
        detail: `${t.unspecified} row(s) have no readable gender; ${t[g]} ${g} rows vs stated ${stated}.`,
      });
    } else {
      const ok = t[g] === stated;
      checks.push({ id, label, result: ok ? "PASS" : "FAIL", detail: `${t[g]} ${g} rows vs stated ${stated}` });
      if (!ok) messages.push(`Participant-count mismatch detected: ${t[g]} ${g} attendance rows vs stated ${stated}.`);
    }
  }

  const anyFail = checks.some((c) => c.result === "FAIL");
  const allPass = checks.every((c) => c.result === "PASS");
  let overall: OverallResult;
  if (anyFail) overall = "FAIL";
  else if (allPass && t.verifiedRows === t.rows) overall = "PASS";
  else if (allPass) overall = "UNVERIFIED";
  else overall = "INSUFFICIENT_DATA";
  if (t.rows > 0 && t.verifiedRows < t.rows) {
    messages.push(`${t.rows - t.verifiedRows} attendance row(s) are not yet verified by a reviewer.`);
  }
  return { overall, checks, stated: s, attendance: t, messages };
}
