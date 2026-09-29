"use client";
import Link from "next/link";
import { useState } from "react";
import { api, errorText } from "@/components/client-api";
import { Badge, MethodBadge, Notice } from "@/components/ui";
import type { Bundle } from "./types";
import type { WorkspaceProps } from "./workspace";

type Props = WorkspaceProps & { locked: boolean; refresh: () => void };
type Row = Bundle["attendance"][number];

const RESULT_TONE: Record<string, "green" | "red" | "amber" | "slate"> = { PASS: "green", FAIL: "red", UNVERIFIED: "amber", INSUFFICIENT_DATA: "slate" };

export function AttendanceTab({ bundle, locked, refresh }: Props) {
  const r = bundle.state.reconciliation;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState("");
  const [ack, setAck] = useState("");
  const [newRow, setNewRow] = useState({ serialNo: "", studentName: "", gender: "unspecified" });
  const url = `/api/activities/${bundle.activity.id}/attendance`;
  const sheets = bundle.sources.filter((s) => s.kind === "attendance");

  const call = async (body: unknown, endpoint = url) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ imported?: number; errors?: string[] }>(endpoint, { body });
      if (res?.errors?.length) setError(`Imported ${res.imported} rows. Skipped: ${res.errors.slice(0, 5).join(" ")}`);
      refresh();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const n = (v: number | null) => (v == null ? <span className="text-muted">Not provided</span> : v);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Participant reconciliation</h2>
            <Badge tone={RESULT_TONE[r.overall]}>{r.overall.replace("_", " ")}</Badge>
          </div>
          <table className="table">
            <thead><tr><th></th><th>Stated in report</th><th>Attendance rows</th></tr></thead>
            <tbody>
              <tr><td>Total</td><td className="tabular-nums">{n(r.stated.total)}</td><td className="tabular-nums">{r.attendance.rows}</td></tr>
              <tr><td>Male</td><td className="tabular-nums">{n(r.stated.male)}</td><td className="tabular-nums">{r.attendance.male}</td></tr>
              <tr><td>Female</td><td className="tabular-nums">{n(r.stated.female)}</td><td className="tabular-nums">{r.attendance.female}</td></tr>
              <tr><td>Not specified</td><td>—</td><td className="tabular-nums">{r.attendance.unspecified}</td></tr>
              <tr><td>Verified rows</td><td>—</td><td className="tabular-nums">{r.attendance.verifiedRows} of {r.attendance.rows}</td></tr>
            </tbody>
          </table>
          <ul className="mt-3 space-y-1 text-xs">
            {r.checks.map((c) => (
              <li key={c.id} className="flex gap-2"><Badge tone={RESULT_TONE[c.result]}>{c.result.replace("_", " ")}</Badge><span>{c.label} — {c.detail}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Stated counts come from the Participants fields (edit them on the Review tab). Gender is counted only where written on the sheet — never inferred from names. Nothing here is corrected automatically.</p>
        </div>
        <div className="space-y-3">
          {r.messages.map((m, i) => <Notice key={i} tone={r.overall === "FAIL" ? "error" : "warn"}>{m}</Notice>)}
          {r.overall === "FAIL" && !locked && (
            bundle.state.ackValid ? (
              <Notice tone="info">Mismatch acknowledged by {bundle.activity.reconciliation_ack?.by}: “{bundle.activity.reconciliation_ack?.note}”</Notice>
            ) : (
              <div className="card space-y-2 p-4">
                <h3 className="text-sm font-semibold">Acknowledge mismatch</h3>
                <p className="text-xs text-muted">If the counts are correct and the difference is explained (e.g. a student attended but did not sign), record why. This is audited and printed on the attendance summary. It becomes invalid if the counts change.</p>
                <textarea className="input min-h-16" value={ack} onChange={(e) => setAck(e.target.value)} maxLength={1000} placeholder="Explanation (min. 10 characters)" />
                <button className="btn btn-secondary btn-sm" disabled={busy || ack.trim().length < 10} onClick={async () => (await call({ note: ack }, `/api/activities/${bundle.activity.id}/reconciliation-ack`)) && setAck("")}>Record acknowledgement</button>
              </div>
            )
          )}
          {sheets.length > 0 && (
            <div className="card p-4 text-sm">
              <h3 className="mb-1 text-sm font-semibold">Attendance sheets</h3>
              <p className="mb-2 text-xs text-muted">Open the sheet next to this table to verify each row.</p>
              {sheets.map((s) => <div key={s.id}><Link href={`/documents/${s.id}`} target="_blank" className="text-brand hover:underline">{s.filename}</Link></div>)}
            </div>
          )}
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Attendance rows ({bundle.attendance.length})</h2>
          {!locked && bundle.attendance.some((x) => !x.verified) && (
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => confirm("Mark every row as verified? Only do this after checking each row against the original sheet.") && call({ action: "verify_all" })}
            >
              Mark all rows verified
            </button>
          )}
        </div>
        {bundle.attendance.some((x) => x.method === "ocr" && !x.verified) && (
          <div className="px-4 pt-3"><Notice tone="warn">Attendance could not be reliably read. Rows below are an OCR draft of a handwritten sheet — check every name and gender against the original and correct, delete or add rows as needed.</Notice></div>
        )}
        <table className="table">
          <thead>
            <tr><th className="w-20">Sr. No.</th><th>Name of student</th><th className="w-36">Gender</th><th className="w-40">Entry</th><th>Issues</th><th className="w-24">Verified</th><th className="w-16"></th></tr>
          </thead>
          <tbody>
            {bundle.attendance.map((row) => <AttRow key={row.id} row={row} locked={locked} call={call} />)}
            {!locked && (
              <tr className="bg-slate-50">
                <td><input className="input" inputMode="numeric" value={newRow.serialNo} onChange={(e) => setNewRow({ ...newRow, serialNo: e.target.value })} placeholder="#" /></td>
                <td><input className="input" value={newRow.studentName} onChange={(e) => setNewRow({ ...newRow, studentName: e.target.value })} placeholder="Name as written on the sheet" /></td>
                <td>
                  <select className="input" value={newRow.gender} onChange={(e) => setNewRow({ ...newRow, gender: e.target.value })}>
                    <option value="unspecified">Not specified</option><option value="male">Male</option><option value="female">Female</option>
                  </select>
                </td>
                <td colSpan={4}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy || !newRow.studentName.trim()}
                    onClick={async () => {
                      // Clear the form immediately so typing the next row is never overwritten.
                      const submitted = newRow;
                      setNewRow({ serialNo: /^\d+$/.test(submitted.serialNo) ? String(Number(submitted.serialNo) + 1) : "", studentName: "", gender: "unspecified" });
                      const ok = await call({ action: "add", row: { serialNo: /^\d+$/.test(submitted.serialNo) ? Number(submitted.serialNo) : null, studentName: submitted.studentName, gender: submitted.gender } });
                      if (!ok) setNewRow(submitted);
                    }}
                  >
                    Add row
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!locked && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Import rows from CSV</summary>
          <p className="mt-2 text-xs text-muted">First line must be a header with a <code>name</code> column; optional <code>sr</code>/<code>serial</code> and <code>gender</code> columns. Gender is only set when written as male/female/M/F. Imported rows start unverified.</p>
          <textarea className="input mt-2 min-h-28 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"Sr No,Name,Gender\n1,Student name,Male"} />
          <button className="btn btn-secondary btn-sm mt-2" disabled={busy || !csv.trim()} onClick={async () => (await call({ action: "import_csv", csv })) && setCsv("")}>Import</button>
        </details>
      )}
    </div>
  );
}

function AttRow({ row, locked, call }: { row: Row; locked: boolean; call: (b: unknown) => Promise<boolean> }) {
  const [name, setName] = useState(row.student_name);
  const [serial, setSerial] = useState(row.serial_no == null ? "" : String(row.serial_no));
  const dirty = name !== row.student_name || serial !== (row.serial_no == null ? "" : String(row.serial_no));
  const update = (patch: Record<string, unknown>) => call({ action: "update", rowId: row.id, row: patch });
  return (
    <tr className={row.verified ? undefined : "bg-amber-50/40"}>
      <td>{locked ? row.serial_no : <input className="input" value={serial} onChange={(e) => setSerial(e.target.value)} />}</td>
      <td>
        {locked ? row.student_name : <input className="input" value={name} onChange={(e) => setName(e.target.value)} />}
        {dirty && !locked && (
          <button className="btn btn-primary btn-sm mt-1" onClick={() => update({ studentName: name, serialNo: /^\d+$/.test(serial) ? Number(serial) : null })}>Save</button>
        )}
      </td>
      <td>
        {locked ? row.gender : (
          <select className="input" value={row.gender} onChange={(e) => update({ gender: e.target.value })}>
            <option value="unspecified">Not specified</option><option value="male">Male</option><option value="female">Female</option>
          </select>
        )}
        {row.gender_raw && <div className="text-[11px] text-muted">read as “{row.gender_raw}”</div>}
      </td>
      <td className="text-xs">
        <MethodBadge method={row.method} />
        {row.source_filename && <div className="mt-0.5 text-muted">{row.source_filename}{row.page ? ` · p.${row.page}` : ""}</div>}
        {row.confidence != null && <div className="text-muted">{Math.round(Number(row.confidence) * 100)}%</div>}
      </td>
      <td className="text-xs text-amber-900">{row.issues.join(" · ")}</td>
      <td><input type="checkbox" disabled={locked} checked={row.verified} onChange={(e) => update({ verified: e.target.checked })} aria-label="Verified" /></td>
      <td>{!locked && <button className="text-xs text-red-700 underline" onClick={() => confirm("Delete this row?") && call({ action: "delete", rowId: row.id })}>Delete</button>}</td>
    </tr>
  );
}
