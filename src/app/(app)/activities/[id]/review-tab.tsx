"use client";
import Link from "next/link";
import { Fragment, useState } from "react";
import { formatValue } from "@/lib/normalize";
import type { TemplateField } from "@/lib/templates/schema";
import { SOURCE_KIND_LABELS } from "@/lib/templates/schema";
import { api, errorText } from "@/components/client-api";
import { Badge, FieldStatusChip, fmtDateTime, MethodBadge, Notice } from "@/components/ui";
import { FieldInput } from "./field-input";
import type { Bundle } from "./types";
import type { WorkspaceProps } from "./workspace";

const LOW = 0.8;

type Props = WorkspaceProps & { locked: boolean; refresh: () => void };

export function ReviewTab({ bundle, locked, refresh, ai }: Props) {
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const def = bundle.state.def;
  const attention = new Set(bundle.state.blocking.filter((b) => b.field).map((b) => b.field!));
  const fields = def.fields.filter((f) => !onlyAttention || attention.has(f.key));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">
          Every value shows where it came from. Values read by rules or OCR below {LOW * 100}% confidence must be confirmed or corrected. Conflicting values are never chosen automatically — pick the correct one or type it.
        </p>
        <div className="flex items-center gap-3">
          {ai.mode === "llm" && !locked && (
            <button
              className="btn btn-secondary btn-sm"
              disabled={aiBusy}
              title={ai.label}
              onClick={async () => {
                setAiBusy(true);
                setError(null);
                try {
                  const r = await api<{ accepted: number; rejected: number }>(`/api/activities/${bundle.activity.id}/ai-extract`, { body: {} });
                  setError(`LLM-assisted extraction added ${r.accepted} grounded value(s); ${r.rejected} unsupported value(s) were discarded.`);
                  refresh();
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setAiBusy(false);
                }
              }}
            >
              {aiBusy ? "Running…" : "Run LLM-assisted extraction"}
            </button>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />
            Only fields needing attention ({attention.size})
          </label>
        </div>
      </div>
      {error && <Notice tone="info">{error}</Notice>}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="w-48">Field</th>
              <th>Value</th>
              <th className="w-56">Source</th>
              <th className="w-24">Confidence</th>
              <th className="w-40">Status</th>
              <th className="w-36"></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <FieldRow key={f.key} field={f} bundle={bundle} locked={locked} refresh={refresh} attention={attention.has(f.key)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FieldRow({ field, bundle, locked, refresh, attention }: { field: TemplateField; bundle: Bundle; locked: boolean; refresh: () => void; attention: boolean }) {
  const def = bundle.state.def;
  const row = bundle.state.fields.find((x) => x.field_key === field.key);
  const cands = bundle.candidates.filter((c) => c.fieldKey === field.key);
  const [editing, setEditing] = useState(false);
  // Conflicting fields show their source values until the reviewer toggles the
  // panel; this must also apply when a conflict appears after a later upload.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const showCands = toggled ?? row?.status === "conflicting";
  const [draft, setDraft] = useState(row?.value ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = row?.status ?? "missing";
  const conf = row?.confidence == null ? null : Number(row.confidence);
  const source = bundle.sources.find((s) => s.id === row?.source_id);
  const lowConf = status === "extracted" && !row?.edited_by && conf != null && conf < LOW;
  const editor = row?.edited_by ? (bundle.editors[row.edited_by] ?? "a reviewer") : null;
  const distinct = new Set(cands.map((c) => c.normalized)).size;

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/activities/${bundle.activity.id}/fields/${field.key}`, { body });
      setEditing(false);
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const display = (v: string) => formatValue(field.type, v, def.dateFormat);

  return (
    <Fragment>
      <tr className={attention ? "bg-amber-50/40" : undefined}>
        <td>
          <div className="font-medium">{field.label}{field.required && <span className="text-red-700"> *</span>}</div>
          <div className="font-mono text-[11px] text-muted">{field.key}</div>
        </td>
        <td className="max-w-xl">
          {editing ? (
            <div className="space-y-2">
              <FieldInput id={`e-${field.key}`} field={field} value={draft} onChange={setDraft} />
              <input className="input" placeholder="Note (optional) — why this value?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => call({ action: "set", value: draft.trim() === "" ? null : draft, note: note || undefined })}>Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : row?.value ? (
            <div className={field.type === "longtext" ? "line-clamp-4 whitespace-pre-wrap text-sm" : "text-sm"} title={row.value}>{display(row.value)}</div>
          ) : status === "conflicting" ? (
            <span className="text-sm text-red-700">Conflict detected — review required. {distinct} different values found.</span>
          ) : (
            <span className="text-sm italic text-muted">Not provided</span>
          )}
          {row?.original_value != null && row.status === "user_entered" && (
            <div className="mt-1 text-xs text-muted">Originally extracted: <span className="line-through">{display(row.original_value).slice(0, 160)}</span></div>
          )}
          {editor && (
            <div className="mt-1 text-xs text-muted">
              {row?.note ?? "Edited"} · {editor} · {fmtDateTime(row?.edited_at)}
            </div>
          )}
          {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        </td>
        <td className="text-xs">
          {source ? (
            <Link href={`/documents/${source.id}?page=${row?.source_page ?? 1}`} className="text-brand hover:underline">
              {source.filename} — Page {row?.source_page}
            </Link>
          ) : status === "user_entered" ? (
            <span className="text-muted">Entered by user</span>
          ) : (
            <span className="text-muted">—</span>
          )}
          <div className="mt-1"><MethodBadge method={row?.method ?? null} /></div>
        </td>
        <td className="text-xs tabular-nums">{conf == null ? "—" : <span className={conf < LOW ? "font-semibold text-amber-700" : ""}>{Math.round(conf * 100)}%</span>}</td>
        <td>
          <FieldStatusChip status={status} />
          {lowConf && <div className="mt-1"><Badge tone="amber">Low confidence — confirm</Badge></div>}
        </td>
        <td className="text-right">
          {!locked && !editing && (
            <div className="flex flex-col items-end gap-1">
              <button className="btn btn-secondary btn-sm" onClick={() => { setDraft(row?.value ?? ""); setEditing(true); }}>{status === "conflicting" ? "Enter value" : "Edit"}</button>
              {lowConf && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => call({ action: "confirm" })}>Confirm</button>}
            </div>
          )}
          {cands.length > 0 && (
            <button className="mt-1 text-xs text-brand underline" onClick={() => setToggled(!showCands)}>
              {showCands ? "Hide" : "Show"} {cands.length} source value{cands.length > 1 ? "s" : ""}
            </button>
          )}
        </td>
      </tr>
      {showCands && cands.length > 0 && (
        <tr>
          <td colSpan={6} className="bg-slate-50">
            <div className="space-y-2 py-1">
              {status === "conflicting" && <Notice tone="error">Documents contain different values for {field.label}. Choose the correct one, or enter it manually.</Notice>}
              {cands.map((c) => (
                <div key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line bg-white p-2.5">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{display(c.value).slice(0, 400)}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Link href={`/documents/${c.sourceId}?page=${c.page}`} className="text-brand hover:underline">{c.filename} — Page {c.page}</Link>
                      <span>{SOURCE_KIND_LABELS[c.sourceKind]}</span>
                      <MethodBadge method={c.method} />
                      <span>rule: <code>{c.rule}</code></span>
                      <span>{Math.round(c.confidence * 100)}%</span>
                      {row?.candidate_id === c.id && <Badge tone="green">In use</Badge>}
                    </div>
                    {c.snippet && <pre className="mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-1.5 font-mono text-[11px] text-slate-700">{c.snippet}</pre>}
                  </div>
                  {!locked && row?.candidate_id !== c.id && (
                    <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => call({ action: "choose", candidateId: c.id })}>Use this value</button>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
