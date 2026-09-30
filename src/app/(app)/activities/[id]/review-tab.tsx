"use client";
import { useMemo, useState } from "react";
import { AlertOctagon, Bot, Check, ChevronDown, Eye, GitCompareArrows, Pencil, ScanText, X } from "lucide-react";
import { formatValue } from "@/lib/normalize";
import type { TemplateField } from "@/lib/templates/schema";
import { SOURCE_KIND_LABELS } from "@/lib/templates/schema";
import { LOW_CONFIDENCE, trustState, TRUST_LABEL, type TrustState } from "@/lib/trust";
import { api, errorText } from "@/components/client-api";
import { Badge, Button, ConfidenceBadge, cx, Drawer, EmptyState, fmtDateTime, MethodBadge, Notice, Segmented, SourceBadge, TrustBadge } from "@/components/ui";
import { FieldInput } from "./field-input";
import type { Bundle } from "./types";
import type { TabProps } from "./workspace";

type Filter = "all" | "attention" | TrustState;
type Candidate = Bundle["candidates"][number];
type Preview = { sourceId: string; page: number; field: string; value?: string; candidate?: Candidate };

const GROUPS: [TemplateField["group"], string][] = [
  ["details", "Activity details"],
  ["participants", "Participants"],
  ["narrative", "Narrative"],
  ["signatories", "Signatories"],
  ["other", "Other"],
];

export function ReviewTab({ bundle, locked, refresh, ai }: TabProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [note, setNote] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const def = bundle.state.def;
  const attention = useMemo(() => new Set(bundle.state.blocking.filter((b) => b.field).map((b) => b.field!)), [bundle.state.blocking]);
  const stateOf = (key: string) => trustState(bundle.state.fields.find((x) => x.field_key === key));
  const counts = (f: Filter) => def.fields.filter((x) => match(f, x.key)).length;
  const match = (f: Filter, key: string) => f === "all" || (f === "attention" ? attention.has(key) : stateOf(key) === f);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="t-body max-w-3xl text-fg-2">
          Every value shows where it came from. Values read by rules or OCR below {LOW_CONFIDENCE * 100}% confidence must be confirmed or corrected. Conflicting values are never chosen automatically — pick the correct one or type it.
        </p>
        {ai.mode === "llm" && !locked && (
          <Button
            size="sm"
            icon={Bot}
            loading={aiBusy}
            disabled={aiBusy}
            title={ai.label}
            onClick={async () => {
              setAiBusy(true);
              setNote(null);
              try {
                const r = await api<{ accepted: number; rejected: number }>(`/api/activities/${bundle.activity.id}/ai-extract`, { body: {} });
                setNote(`LLM-assisted extraction added ${r.accepted} grounded value(s); ${r.rejected} unsupported value(s) were discarded.`);
                refresh();
              } catch (e) {
                setNote(errorText(e));
              } finally {
                setAiBusy(false);
              }
            }}
          >
            {aiBusy ? "Running…" : "Run LLM-assisted extraction"}
          </Button>
        )}
      </div>
      <Segmented<Filter>
        ariaLabel="Filter fields"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All fields", count: counts("all") },
          { value: "attention", label: "Needs attention", count: counts("attention") },
          { value: "conflict", label: TRUST_LABEL.conflict, count: counts("conflict") },
          { value: "needs_review", label: TRUST_LABEL.needs_review, count: counts("needs_review") },
          { value: "missing", label: TRUST_LABEL.missing, count: counts("missing") },
          { value: "source_backed", label: TRUST_LABEL.source_backed, count: counts("source_backed") },
          { value: "verified", label: TRUST_LABEL.verified, count: counts("verified") },
        ]}
      />
      {note && <Notice tone="info">{note}</Notice>}

      {counts(filter) === 0 ? (
        <EmptyState icon={Check} title="No fields in this view">
          {filter === "attention" ? "Nothing needs attention." : "Choose another filter to see fields."}
        </EmptyState>
      ) : (
        GROUPS.map(([g, label]) => {
          const fields = def.fields.filter((f) => f.group === g && match(filter, f.key));
          if (!fields.length) return null;
          return (
            <section key={g} aria-label={label} className="space-y-2">
              <h2 className="t-caption pt-2">{label}</h2>
              {fields.map((f) => (
                <FieldCard key={f.key} field={f} bundle={bundle} locked={locked} refresh={refresh} attention={attention.has(f.key)} onPreview={setPreview} />
              ))}
            </section>
          );
        })
      )}
      <SourcePreview preview={preview} bundle={bundle} onClose={() => setPreview(null)} />
    </div>
  );
}

function FieldCard({ field, bundle, locked, refresh, attention, onPreview }: { field: TemplateField; bundle: Bundle; locked: boolean; refresh: () => void; attention: boolean; onPreview: (p: Preview) => void }) {
  const def = bundle.state.def;
  const row = bundle.state.fields.find((x) => x.field_key === field.key);
  const cands = bundle.candidates.filter((c) => c.fieldKey === field.key);
  const [editing, setEditing] = useState(false);
  // Conflicting fields show their source values until the reviewer toggles the
  // panel; this must also apply when a conflict appears after a later upload.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const status = row?.status ?? "missing";
  const showCands = toggled ?? status === "conflicting";
  const [draft, setDraft] = useState(row?.value ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = trustState(row);
  const conf = row?.confidence == null ? null : Number(row.confidence);
  const source = bundle.sources.find((s) => s.id === row?.source_id);
  const lowConf = status === "extracted" && !row?.edited_by && conf != null && conf < LOW_CONFIDENCE;
  const editor = row?.edited_by ? (bundle.editors[row.edited_by] ?? "a reviewer") : null;
  const distinct = new Set(cands.map((c) => c.normalized)).size;
  const conflict = status === "conflicting";

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
    <article
      data-testid={`field-${field.key}`}
      className={cx(
        "card overflow-hidden transition-colors",
        conflict ? "border-danger-line" : lowConf ? "border-warning-line" : attention ? "border-warning-line" : undefined,
      )}
    >
      <div className={cx("flex flex-col gap-3 p-4 md:flex-row md:items-start", conflict && "bg-danger-soft/40")}>
        <div className="md:w-56 md:shrink-0">
          <h3 className="text-[13.5px] font-medium">
            {field.label}
            {field.required && <span className="text-danger" title="Required before approval"> *</span>}
          </h3>
          <div className="mt-0.5 font-mono text-[11px] text-subtle">{field.key}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <TrustBadge state={st} label={conflict ? "Conflict — review required" : undefined} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <FieldInput id={`e-${field.key}`} field={field} value={draft} onChange={setDraft} />
              <input className="input" placeholder="Note (optional) — why this value?" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" icon={Check} loading={busy} disabled={busy} onClick={() => call({ action: "set", value: draft.trim() === "" ? null : draft, note: note || undefined })}>
                  Save
                </Button>
                <Button size="sm" icon={X} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : row?.value ? (
            <p className={cx("text-[14px] leading-relaxed text-foreground", field.type === "longtext" && "line-clamp-5 whitespace-pre-wrap")} title={row.value}>
              {display(row.value)}
            </p>
          ) : conflict ? (
            <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-danger">
              <AlertOctagon className="h-4 w-4" aria-hidden /> Conflict detected — review required. {distinct} different values found.
            </p>
          ) : (
            <p className="text-[13.5px]"><span className="missing-mark">Not provided</span></p>
          )}
          {row?.original_value != null && status === "user_entered" && (
            <p className="t-meta mt-1.5">
              Originally extracted: <span className="line-through">{display(row.original_value).slice(0, 160)}</span>
            </p>
          )}
          {editor && (
            <p className="t-meta mt-1">
              {row?.note ?? "Edited"} · {editor} · {fmtDateTime(row?.edited_at)}
            </p>
          )}
          {error && <p className="mt-1.5 text-[12.5px] text-danger" role="alert">{error}</p>}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {source ? (
              <>
                <SourceBadge sourceId={source.id} filename={`${source.filename} — Page ${row?.source_page ?? 1}`} mime={source.mime_type} />
                <button className="btn btn-ghost btn-sm" onClick={() => onPreview({ sourceId: source.id, page: row?.source_page ?? 1, field: field.label, value: row?.value ?? undefined, candidate: cands.find((c) => c.id === row?.candidate_id) })}>
                  <Eye className="h-3.5 w-3.5" aria-hidden /> Preview source
                </button>
              </>
            ) : status === "user_entered" ? (
              <span className="t-meta">Entered by user</span>
            ) : null}
            <MethodBadge method={row?.method ?? null} />
            {conf != null && <ConfidenceBadge value={conf} />}
            {lowConf && <Badge tone="warning">Low confidence — confirm</Badge>}
          </div>
        </div>

        <div className="flex shrink-0 flex-row flex-wrap items-center gap-1.5 md:flex-col md:items-end">
          {!locked && !editing && (
            <>
              {lowConf && (
                <Button size="sm" variant="primary" icon={Check} disabled={busy} onClick={() => call({ action: "confirm" })}>
                  Confirm
                </Button>
              )}
              <Button
                size="sm"
                icon={Pencil}
                onClick={() => {
                  setDraft(row?.value ?? "");
                  setEditing(true);
                }}
              >
                {conflict ? "Enter value" : "Edit"}
              </Button>
            </>
          )}
          {cands.length > 0 && (
            <button className="btn btn-ghost btn-sm" aria-expanded={showCands} onClick={() => setToggled(!showCands)}>
              <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", showCands && "rotate-180")} aria-hidden />
              {showCands ? "Hide" : "Show"} {cands.length} source value{cands.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      {showCands && cands.length > 0 && (
        <div className="anim-fade border-t border-line bg-surface-2 p-4">
          {conflict && (
            <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-[13px] text-danger" role="alert">
              <GitCompareArrows className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold">Documents contain different values for {field.label}.</strong> Choose the correct one, or enter it manually. The system will not pick one for you.
              </span>
            </div>
          )}
          <ul className={cx("grid gap-2.5", conflict && cands.length > 1 && "lg:grid-cols-2")}>
            {cands.map((c) => {
              const inUse = row?.candidate_id === c.id;
              return (
                <li key={c.id} data-testid="candidate" className={cx("flex flex-col rounded-lg border bg-surface p-3", inUse ? "border-success-line ring-1 ring-success-line" : "border-line")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-[13.5px] font-medium">{display(c.value).slice(0, 400)}</p>
                    {inUse && <Badge tone="success" icon={Check}>In use</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <SourceBadge sourceId={c.sourceId} filename={`${c.filename} — Page ${c.page}`} />
                    <Badge>{SOURCE_KIND_LABELS[c.sourceKind]}</Badge>
                    <MethodBadge method={c.method} />
                    <ConfidenceBadge value={c.confidence} />
                  </div>
                  <p className="t-meta mt-1.5">
                    Rule: <code className="font-mono text-[11px]">{c.rule}</code>
                  </p>
                  {c.snippet && <pre className="scroll-thin mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-2 font-mono text-[11px] text-fg-2">{c.snippet}</pre>}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <button className="btn btn-ghost btn-sm" onClick={() => onPreview({ sourceId: c.sourceId, page: c.page, field: field.label, value: c.value, candidate: c })}>
                      <Eye className="h-3.5 w-3.5" aria-hidden /> Preview source
                    </button>
                    {!locked && !inUse && (
                      <Button size="sm" variant={conflict ? "primary" : "secondary"} disabled={busy} onClick={() => call({ action: "choose", candidateId: c.id })}>
                        Use this value
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}

/** Split-screen view of the cited page and the text the value was read from. */
function SourcePreview({ preview, bundle, onClose }: { preview: Preview | null; bundle: Bundle; onClose: () => void }) {
  const s = preview ? bundle.sources.find((x) => x.id === preview.sourceId) : null;
  const url = s ? `/api/sources/${s.id}/file` : "";
  return (
    <Drawer open={!!preview && !!s} onClose={onClose} title={s ? `${s.filename} — Page ${preview?.page}` : ""}>
      {s && preview && (
        <div className="grid h-full lg:grid-cols-[1fr_340px]">
          <div className="min-h-[50vh] bg-surface-3">
            {s.mime_type === "application/pdf" ? (
              <iframe title={`${s.filename} page ${preview.page}`} src={`${url}#page=${preview.page}`} className="h-full min-h-[70vh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={s.caption ?? s.filename} className="mx-auto max-h-[85vh] w-auto object-contain" />
            )}
          </div>
          <aside className="space-y-4 border-t border-line p-4 lg:border-l lg:border-t-0">
            <div>
              <p className="t-caption">Field</p>
              <p className="mt-1 text-[13.5px] font-medium">{preview.field}</p>
            </div>
            {preview.value && (
              <div>
                <p className="t-caption">Value</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px]">{preview.value.slice(0, 600)}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Badge>{SOURCE_KIND_LABELS[s.kind]}</Badge>
              <Badge>Page {preview.page}</Badge>
              {preview.candidate && <MethodBadge method={preview.candidate.method} />}
              {preview.candidate && <ConfidenceBadge value={preview.candidate.confidence} />}
            </div>
            {preview.candidate?.snippet ? (
              <div>
                <p className="t-caption flex items-center gap-1.5">
                  <ScanText className="h-3 w-3" aria-hidden /> Extracted text around the value
                </p>
                <pre className="scroll-thin mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-2.5 font-mono text-[11.5px] text-fg-2">{preview.candidate.snippet}</pre>
                <p className="t-meta mt-1.5">
                  Rule <code className="font-mono">{preview.candidate.rule}</code>
                </p>
              </div>
            ) : (
              <p className="t-meta">No text excerpt is stored for this value.</p>
            )}
            <p className="t-meta rounded-md border border-line bg-surface-2 p-2.5">The page is shown as uploaded. The exact position of the value on the page is not recorded, so nothing is highlighted — compare the excerpt with the page.</p>
            <a className="btn btn-secondary btn-sm" href={`/documents/${s.id}?page=${preview.page}`}>
              Open document viewer
            </a>
          </aside>
        </div>
      )}
    </Drawer>
  );
}
