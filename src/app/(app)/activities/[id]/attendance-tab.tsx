"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCheck, CheckCircle2, ExternalLink, FileSpreadsheet, ListChecks, Plus, Scale, Trash2, UserRound, Users } from "lucide-react";
import { api, errorText } from "@/components/client-api";
import { Badge, Button, Card, CardHeader, ConfidenceBadge, cx, MethodBadge, Modal, Notice, StatCard, type Tone } from "@/components/ui";
import type { Bundle } from "./types";
import { ReconBadge, type TabProps } from "./workspace";

type Row = Bundle["attendance"][number];

const RESULT_TONE: Record<string, Tone> = { PASS: "success", FAIL: "danger", UNVERIFIED: "warning", INSUFFICIENT_DATA: "neutral" };
const RESULT_LABEL: Record<string, string> = { PASS: "Pass", FAIL: "Fail", UNVERIFIED: "Unverified", INSUFFICIENT_DATA: "Insufficient data" };

export function AttendanceTab({ bundle, locked, refresh }: TabProps) {
  const r = bundle.state.reconciliation;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState("");
  const [ack, setAck] = useState("");
  const [confirm, setConfirm] = useState<null | { title: string; body: string; run: () => Promise<unknown> }>(null);
  const [newRow, setNewRow] = useState({ serialNo: "", studentName: "", gender: "unspecified" });
  const url = `/api/activities/${bundle.activity.id}/attendance`;
  const sheets = bundle.sources.filter((s) => s.kind === "attendance");
  const unverified = bundle.attendance.filter((x) => !x.verified).length;

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

  const compare: [string, number | null, number][] = [
    ["Total", r.stated.total, r.attendance.rows],
    ["Male", r.stated.male, r.attendance.male],
    ["Female", r.stated.female, r.attendance.female],
  ];
  const max = Math.max(1, ...compare.flatMap(([, a, b]) => [a ?? 0, b]));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Stated total" value={r.stated.total ?? "—"} hint={r.stated.total == null ? "Not provided in the report" : "From the Participants fields"} icon={Users} tone="brand" />
        <StatCard label="Rows on sheets" value={r.attendance.rows} hint={`${r.attendance.male} male · ${r.attendance.female} female · ${r.attendance.unspecified} not specified`} icon={ListChecks} tone="neutral" />
        <StatCard label="Verified rows" value={r.attendance.verifiedRows} hint={`of ${r.attendance.rows} rows`} icon={CheckCircle2} tone="success" />
        <StatCard label="Needs verification" value={unverified} hint="Check against the original sheet" icon={AlertTriangle} tone={unverified ? "warning" : "neutral"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader icon={Scale} title="Participant reconciliation" description="Stated in report vs. rows on the attendance sheets" actions={<ReconBadge result={r.overall} ack={bundle.state.ackValid} />} />
          <div className="space-y-4 px-4 py-4">
            {compare.map(([label, stated, rows]) => {
              const ok = stated == null ? null : stated === rows;
              return (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                    <span className="font-medium">{label}</span>
                    <span className={cx("flex items-center gap-1", ok === true ? "text-success" : ok === false ? "text-danger" : "text-muted")}>
                      {ok === true ? "Match" : ok === false ? `Differs by ${Math.abs((stated ?? 0) - rows)}` : "Not stated"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[92px_1fr_36px] items-center gap-2 text-[11.5px] text-muted">
                    <span>Stated</span>
                    <div className="h-2 rounded-full bg-surface-3">{stated != null && <div className="h-2 rounded-full bg-brand" style={{ width: `${(stated / max) * 100}%` }} />}</div>
                    <span className="t-num text-right text-foreground">{stated ?? "—"}</span>
                    <span>Sheet rows</span>
                    <div className="h-2 rounded-full bg-surface-3"><div className={cx("h-2 rounded-full", ok === false ? "bg-danger" : "bg-success")} style={{ width: `${(rows / max) * 100}%` }} /></div>
                    <span className="t-num text-right text-foreground">{rows}</span>
                  </div>
                </div>
              );
            })}
            <ul className="space-y-1.5 border-t border-line pt-3">
              {r.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[12.5px]">
                  <Badge tone={RESULT_TONE[c.result]}>{RESULT_LABEL[c.result] ?? c.result}</Badge>
                  <span>
                    <span className="font-medium">{c.label}</span> <span className="text-muted">— {c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="t-meta">Stated counts come from the Participants fields (edit them on the Review tab). Gender is counted only where written on the sheet — never inferred from names. Nothing here is corrected automatically.</p>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {r.messages.map((m, i) => (
            <Notice key={i} tone={r.overall === "FAIL" ? "error" : "warn"}>{m}</Notice>
          ))}
          {r.overall === "FAIL" && !locked &&
            (bundle.state.ackValid ? (
              <Notice tone="info">
                Mismatch acknowledged by {bundle.activity.reconciliation_ack?.by}: “{bundle.activity.reconciliation_ack?.note}”
              </Notice>
            ) : (
              <Card className="space-y-2 p-4">
                <h3 className="t-card">Acknowledge mismatch</h3>
                <p className="t-meta">If the counts are correct and the difference is explained (e.g. a student attended but did not sign), record why. This is audited and printed on the attendance summary. It becomes invalid if the counts change.</p>
                <label className="sr-only" htmlFor="ack">Explanation</label>
                <textarea id="ack" className="input min-h-16" value={ack} onChange={(e) => setAck(e.target.value)} maxLength={1000} placeholder="Explanation (min. 10 characters)" />
                <Button size="sm" disabled={busy || ack.trim().length < 10} onClick={async () => (await call({ note: ack }, `/api/activities/${bundle.activity.id}/reconciliation-ack`)) && setAck("")}>
                  Record acknowledgement
                </Button>
              </Card>
            ))}
          <Card>
            <CardHeader icon={FileSpreadsheet} title="Attendance sheets" description="Open the sheet beside this table to verify each row." />
            {sheets.length ? (
              <ul className="divide-y divide-line">
                {sheets.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                    <span className="truncate">{s.filename}</span>
                    <Link href={`/documents/${s.id}`} target="_blank" className="btn btn-ghost btn-sm shrink-0">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-meta px-4 py-3">No attendance sheet uploaded. Rows can be added below or imported from CSV.</p>
            )}
          </Card>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Card className="overflow-hidden">
        <CardHeader
          icon={ListChecks}
          title={`Attendance rows (${bundle.attendance.length})`}
          actions={
            !locked && unverified > 0 ? (
              <Button
                size="sm"
                icon={CheckCheck}
                disabled={busy}
                onClick={() => setConfirm({ title: "Mark every row as verified?", body: "Only do this after checking each row against the original sheet. This is recorded in the audit log.", run: () => call({ action: "verify_all" }) })}
              >
                Mark all rows verified
              </Button>
            ) : undefined
          }
        />
        {bundle.attendance.some((x) => x.method === "ocr" && !x.verified) && (
          <div className="px-4 pt-3">
            <Notice tone="warn">Attendance could not be reliably read. Rows below are an OCR draft of a handwritten sheet — check every name and gender against the original and correct, delete or add rows as needed.</Notice>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-20">Sr. No.</th>
                <th>Name of student</th>
                <th className="w-36">Gender</th>
                <th className="w-44">Entry</th>
                <th className="w-44">Status</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {bundle.attendance.map((row) => (
                <AttRow key={row.id} row={row} locked={locked} call={call} onDelete={() => setConfirm({ title: "Delete this row?", body: `Remove “${row.student_name}” from the attendance list. This is recorded in the audit log.`, run: () => call({ action: "delete", rowId: row.id }) })} />
              ))}
              {!locked && (
                <tr className="bg-surface-2" data-testid="new-attendance-row">
                  <td>
                    <input className="input" inputMode="numeric" aria-label="Serial number" value={newRow.serialNo} onChange={(e) => setNewRow({ ...newRow, serialNo: e.target.value })} placeholder="#" />
                  </td>
                  <td>
                    <input className="input" aria-label="Student name" value={newRow.studentName} onChange={(e) => setNewRow({ ...newRow, studentName: e.target.value })} placeholder="Name as written on the sheet" />
                  </td>
                  <td>
                    <select className="input" aria-label="Gender" value={newRow.gender} onChange={(e) => setNewRow({ ...newRow, gender: e.target.value })}>
                      <option value="unspecified">Not specified</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </td>
                  <td colSpan={3}>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Plus}
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
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {bundle.attendance.length === 0 && locked && <p className="t-meta px-4 py-4">No attendance rows recorded.</p>}
      </Card>

      {!locked && (
        <details className="card group p-4">
          <summary className="t-card cursor-pointer list-none">
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted" aria-hidden /> Import rows from CSV
            </span>
          </summary>
          <p className="t-meta mt-2">
            First line must be a header with a <code>name</code> column; optional <code>sr</code>/<code>serial</code> and <code>gender</code> columns. Gender is only set when written as male/female/M/F. Imported rows start unverified.
          </p>
          <textarea className="input mt-2 min-h-28 font-mono text-xs" aria-label="CSV rows" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"Sr No,Name,Gender\n1,Student name,Male"} />
          <Button size="sm" className="mt-2" disabled={busy || !csv.trim()} onClick={async () => (await call({ action: "import_csv", csv })) && setCsv("")}>
            Import
          </Button>
        </details>
      )}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                await confirm?.run();
                setConfirm(null);
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <p className="t-body">{confirm?.body}</p>
      </Modal>
    </div>
  );
}

function AttRow({ row, locked, call, onDelete }: { row: Row; locked: boolean; call: (b: unknown) => Promise<boolean>; onDelete: () => void }) {
  const [name, setName] = useState(row.student_name);
  const [serial, setSerial] = useState(row.serial_no == null ? "" : String(row.serial_no));
  const dirty = name !== row.student_name || serial !== (row.serial_no == null ? "" : String(row.serial_no));
  const update = (patch: Record<string, unknown>) => call({ action: "update", rowId: row.id, row: patch });
  return (
    <tr className={row.verified ? undefined : "bg-warning-soft/40"} data-testid="attendance-row">
      <td className="t-num">{locked ? row.serial_no : <input className="input" aria-label="Serial number" value={serial} onChange={(e) => setSerial(e.target.value)} />}</td>
      <td>
        {locked ? (
          <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-subtle" aria-hidden />{row.student_name}</span>
        ) : (
          <input className="input" aria-label="Student name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        {dirty && !locked && (
          <Button size="sm" variant="primary" className="mt-1" onClick={() => update({ studentName: name, serialNo: /^\d+$/.test(serial) ? Number(serial) : null })}>
            Save
          </Button>
        )}
        {row.issues.length > 0 && <div className="mt-1 text-[11.5px] text-warning">{row.issues.join(" · ")}</div>}
      </td>
      <td>
        {locked ? (
          <span className="capitalize">{row.gender === "unspecified" ? "Not specified" : row.gender}</span>
        ) : (
          <select className="input" aria-label="Gender" value={row.gender} onChange={(e) => update({ gender: e.target.value })}>
            <option value="unspecified">Not specified</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        )}
        {row.gender_raw && <div className="t-meta mt-0.5">read as “{row.gender_raw}”</div>}
      </td>
      <td className="text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <MethodBadge method={row.method} />
          {row.confidence != null && <ConfidenceBadge value={Number(row.confidence)} />}
        </div>
        {row.source_filename && <div className="t-meta mt-0.5 truncate">{row.source_filename}{row.page ? ` · p.${row.page}` : ""}</div>}
      </td>
      <td>
        <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-[12.5px]">
          <input type="checkbox" className="h-4 w-4 accent-[var(--success)]" disabled={locked} checked={row.verified} onChange={(e) => update({ verified: e.target.checked })} aria-label="Verified" />
          {row.verified ? <span className="text-success">Verified</span> : <span className="text-warning">Needs verification</span>}
        </label>
      </td>
      <td className="text-right">
        {!locked && (
          <button className="btn btn-ghost btn-sm text-danger" onClick={onDelete} aria-label={`Delete row ${row.student_name}`}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </td>
    </tr>
  );
}
