"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertOctagon, CheckCircle2, ExternalLink, FileSearch, Hash, RefreshCw, ScanText, ShieldAlert, Trash2, TriangleAlert, Upload } from "lucide-react";
import { SOURCE_KINDS, SOURCE_KIND_LABELS, type SourceKind } from "@/lib/templates/schema";
import { api, ApiError, errorText } from "@/components/client-api";
import { Badge, Button, Card, CardHeader, cx, EmptyState, FileDropzone, FileIcon, fmtBytes, fmtDateTime, MethodBadge, Modal, Notice, PRIVACY_NOTICE, ProgressIndicator, type Tone } from "@/components/ui";
import type { Bundle } from "./types";
import type { TabProps } from "./workspace";

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/** Stages are set only when the corresponding real step starts or ends. */
type Phase = "upload" | "read" | "ocr" | "extract" | "done" | "failed";
type Job = { name: string; kind: SourceKind; message: string; fraction: number; phase: Phase; usedOcr?: boolean; failedAt?: Phase; error?: string; retryable?: boolean; photo?: boolean; file?: File };

async function runExtraction(sourceId: string, file: Blob, mime: string, onProgress: (m: string, f: number) => void) {
  await api(`/api/sources/${sourceId}/extraction-status`, { body: { status: "processing" } });
  try {
    const { extractInBrowser } = await import("@/lib/extraction/browser");
    const result = await extractInBrowser(file, mime, onProgress);
    onProgress("Saving extracted text and checking fields", 1);
    return await api<{ status: string; readablePages: number; attendanceRows: number }>(`/api/sources/${sourceId}/extraction`, { body: result });
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : `Could not extract text from this file. ${e instanceof Error ? e.message : ""}`.trim();
    await api(`/api/sources/${sourceId}/extraction-status`, { body: { status: "failed", error: msg.slice(0, 300) } }).catch(() => {});
    throw new Error(msg);
  }
}

/** Map a real progress message from the extractor to the stage it belongs to. */
function phaseOf(message: string): Phase {
  if (message.startsWith("Saving extracted text")) return "extract";
  if (/reading text|OCR engine/i.test(message)) return "ocr";
  return "read";
}

const ORDER: Phase[] = ["upload", "read", "ocr", "extract"];
function stagesFor(j: Job) {
  const labels: Record<string, string> = { upload: "Uploading", read: "Reading", ocr: "OCR", extract: "Extracting & validating" };
  const cur = j.phase === "failed" ? (j.failedAt ?? "upload") : j.phase;
  const idx = cur === "done" ? ORDER.length : ORDER.indexOf(cur);
  return ORDER.map((p, i) => {
    if (j.photo && p !== "upload") return { label: labels[p], state: "skipped" as const };
    if (p === "ocr" && !j.usedOcr && (idx > i || cur === "done")) return { label: labels[p], state: "skipped" as const };
    if (j.phase === "failed" && p === cur) return { label: labels[p], state: "failed" as const };
    return { label: labels[p], state: i < idx ? ("done" as const) : i === idx ? ("active" as const) : ("pending" as const) };
  });
}

export function EvidenceTab({ bundle, locked, refresh }: TabProps) {
  const [kind, setKind] = useState<SourceKind>("notice");
  const [caption, setCaption] = useState("");
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const setJob = (key: string, j: Partial<Job>) => setJobs((s) => ({ ...s, [key]: { ...s[key], ...j } as Job }));

  async function upload(files: FileList | File[], asKind: SourceKind = kind) {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      setJob(key, { name: file.name, kind: asKind, message: "Uploading", fraction: 0, phase: "upload", photo: asKind === "photo", file });
      if (file.size > MAX_BYTES) {
        setJob(key, { phase: "failed", failedAt: "upload", error: `File is ${fmtBytes(file.size)}; the limit is 4 MB. Please upload a smaller scan (the original is not altered by this app).` });
        continue;
      }
      let stage: Phase = "upload";
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("kind", asKind);
        if (caption.trim()) form.set("caption", caption.trim());
        const res = await fetch(`/api/activities/${bundle.activity.id}/sources`, { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Only server/network failures are worth retrying; validation errors (4xx) are not.
          setJob(key, { phase: "failed", failedAt: "upload", error: data.error ?? `Upload failed (${res.status}).`, retryable: res.status >= 500 });
          refresh();
          continue;
        }
        if (asKind === "photo") {
          setJob(key, { message: "Uploaded (photographs are stored as evidence, not processed)", fraction: 1, phase: "done" });
        } else {
          stage = "read";
          setJob(key, { phase: "read", message: "Opening file" });
          const r = await runExtraction(data.id, file, file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"), (m, f) => {
            stage = phaseOf(m);
            setJobs((s) => ({ ...s, [key]: { ...s[key], message: m, fraction: f, phase: stage, usedOcr: s[key].usedOcr || stage === "ocr" } }));
          });
          if (r.status === "failed") {
            setJob(key, { phase: "failed", failedAt: "extract", message: "Could not extract text from this file. Enter its details manually.", error: "Could not extract text from this file. Enter its details manually." });
          } else {
            setJob(key, { message: `Extracted ${r.readablePages} page(s)${r.attendanceRows ? ` · ${r.attendanceRows} attendance rows drafted for review` : ""}`, fraction: 1, phase: "done" });
          }
        }
      } catch (e) {
        setJob(key, { phase: "failed", failedAt: stage, error: errorText(e), retryable: stage === "upload" });
      }
      refresh();
    }
    setCaption("");
  }

  const docs = bundle.sources;
  return (
    <div className="space-y-5">
      {!locked && (
        <Card>
          <CardHeader icon={Upload} title="Add evidence" description="Notice or poster, attendance sheets, photographs and any existing report." />
          <div className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="label" htmlFor="kind">Document type</label>
                <select id="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}>
                  {SOURCE_KINDS.map((k) => (
                    <option key={k} value={k}>{SOURCE_KIND_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label" htmlFor="caption">Caption <span className="font-normal text-muted">(optional — shown under photographs in the packet)</span></label>
                <input id="caption" className="input" value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} />
              </div>
            </div>
            <FileDropzone
              onFiles={(f) => upload(f)}
              accept={ACCEPT}
              maxLabel="4 MB"
              inputLabel="Choose files to upload"
              hint={<>Uploaded as <strong className="text-fg-2">{SOURCE_KIND_LABELS[kind]}</strong></>}
            />
            <div className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{PRIVACY_NOTICE}</span>
            </div>
            <p className="t-meta">
              Text is read in your browser: PDF text layers are used directly; scanned pages are OCR&apos;d with Tesseract (the OCR engine downloads once from a public CDN). Photographs are attachments only — nothing (date, place, people, counts) is inferred from them.
            </p>
          </div>
        </Card>
      )}

      {Object.keys(jobs).length > 0 && (
        <section aria-label="Upload progress" className="space-y-2">
          {Object.entries(jobs).map(([k, j]) => (
            <div key={k} className={cx("anim-fade rounded-xl border bg-surface px-4 py-3 shadow-xs", j.phase === "failed" ? "border-danger-line" : j.phase === "done" ? "border-success-line" : "border-line")} data-testid="upload-job">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
                  <FileIcon mime={j.file?.type} />
                  <span className="truncate">{j.name}</span>
                  <Badge>{SOURCE_KIND_LABELS[j.kind]}</Badge>
                </span>
                {j.phase === "done" ? (
                  <span className="flex items-center gap-1 text-[12.5px] text-success"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Complete</span>
                ) : j.phase === "failed" ? (
                  <span className="flex items-center gap-1 text-[12.5px] text-danger"><AlertOctagon className="h-3.5 w-3.5" aria-hidden /> Failed</span>
                ) : (
                  <span className="t-num t-meta">{Math.round(j.fraction * 100)}%</span>
                )}
              </div>
              <div className="mt-2">
                <ProgressIndicator stages={stagesFor(j)} />
              </div>
              {j.phase !== "done" && j.phase !== "failed" && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-1 rounded-full bg-brand transition-all" style={{ width: `${Math.round(j.fraction * 100)}%` }} />
                </div>
              )}
              <p className={cx("mt-1.5 text-[12.5px]", j.error ? "text-danger" : "text-muted")} role={j.error ? "alert" : undefined}>
                {j.error ?? j.message}
              </p>
              {j.phase === "failed" && !locked && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {j.file && j.retryable && (
                    <Button size="sm" icon={RefreshCw} onClick={() => { setJobs((s) => { const n = { ...s }; delete n[k]; return n; }); upload([j.file!], j.kind); }}>
                      Retry
                    </Button>
                  )}
                  <span className="t-meta self-center">{j.failedAt === "upload" ? (j.retryable ? "Or upload a different file above." : "Upload a different file above.") : "Use Re-extract on the document below, or enter the details on the Review tab."}</span>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {!locked && docs.length > 0 && bundle.agents.missing.length > 0 && (
        <Notice tone="warn" title={`Missing for the activity packet: ${bundle.agents.missing.map((k) => SOURCE_KIND_LABELS[k]).join(", ")}`}>
          The template&apos;s packet includes {bundle.agents.missing.length === 1 ? "this document" : "these documents"}, but none has been uploaded yet. Upload {bundle.agents.missing.length === 1 ? "it" : "them"} if available.
        </Notice>
      )}

      <SourceList sources={docs} checks={bundle.agents.intake} locked={locked} refresh={refresh} />
    </div>
  );
}

const STATUS: Record<string, [string, Tone]> = {
  pending: ["Not processed", "warning"],
  processing: ["Processing…", "info"],
  done: ["Text extracted", "success"],
  failed: ["Extraction failed", "danger"],
  skipped: ["Evidence only", "neutral"],
};

function SourceList({ sources, checks, locked, refresh }: { sources: Bundle["sources"]; checks: Bundle["agents"]["intake"]; locked: boolean; refresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [removing, setRemoving] = useState<Bundle["sources"][number] | null>(null);
  if (!sources.length)
    return (
      <EmptyState icon={Upload} title="No documents uploaded yet">
        Upload the notice/poster, attendance sheet, photographs and any existing report.
      </EmptyState>
    );

  const extract = async (s: Bundle["sources"][number]) => {
    setBusy(s.id);
    setMsg({ tone: "info", text: `Extracting ${s.filename}…` });
    try {
      const blob = await (await fetch(`/api/sources/${s.id}/file`)).blob();
      await runExtraction(s.id, blob, s.mime_type, (m) => setMsg({ tone: "info", text: `${s.filename}: ${m}` }));
      setMsg(null);
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
    } finally {
      setBusy(null);
      refresh();
    }
  };
  const remove = async (s: Bundle["sources"][number]) => {
    setBusy(s.id);
    try {
      await api(`/api/sources/${s.id}`, { method: "DELETE" });
      setRemoving(null);
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <section className="space-y-3" aria-label="Documents">
      <div className="flex items-center justify-between">
        <h2 className="t-section">Documents <span className="t-num text-muted">({sources.length})</span></h2>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <ul className="grid gap-3 md:grid-cols-2">
        {sources.map((s) => {
          const [label, tone] = STATUS[s.extraction_status] ?? [s.extraction_status, "neutral"];
          return (
            <li key={s.id} className="card flex flex-col p-4" data-testid="source-card">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-line">
                  <FileIcon mime={s.mime_type} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link className="block truncate text-[13.5px] font-medium hover:text-brand" href={`/documents/${s.id}`} title={s.filename}>
                    {s.filename}
                  </Link>
                  <div className="t-meta mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>{SOURCE_KIND_LABELS[s.kind]}</span>
                    <span>·</span>
                    <span>{fmtBytes(s.size_bytes)}</span>
                    <span>·</span>
                    <span>{s.page_count ?? 1} page{(s.page_count ?? 1) === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <Badge tone={tone} dot>{label}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {(s.methods ?? []).map((m) => <MethodBadge key={m} method={m} />)}
                {s.pages_extracted > 0 && <span className="t-meta flex items-center gap-1"><ScanText className="h-3 w-3" aria-hidden />{s.pages_extracted} page{s.pages_extracted === 1 ? "" : "s"} with text</span>}
                {s.mean_confidence != null && (s.methods ?? []).includes("ocr") && <span className="t-meta">· mean OCR confidence {Number(s.mean_confidence).toFixed(0)}%</span>}
              </div>
              <TypeCheck check={checks.find((c) => c.sourceId === s.id)} />
              {s.caption && <p className="mt-2 text-[12.5px] text-fg-2">Caption: {s.caption}</p>}
              {s.extraction_error && <p className="mt-2 text-[12.5px] text-danger">{s.extraction_error}</p>}
              <div className="t-meta mt-2 flex items-center gap-1" title={s.sha256}>
                <Hash className="h-3 w-3" aria-hidden /> sha256 {s.sha256.slice(0, 12)}… · {s.uploaded_by_name} · {fmtDateTime(s.uploaded_at)}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                <Link href={`/documents/${s.id}`} className="btn btn-secondary btn-sm">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open
                </Link>
                {!locked && s.kind !== "photo" && (
                  <Button size="sm" icon={RefreshCw} disabled={!!busy} loading={busy === s.id && !removing} onClick={() => extract(s)}>
                    {s.extraction_status === "done" ? "Re-extract" : "Extract"}
                  </Button>
                )}
                {!locked && (
                  <Button size="sm" variant="ghost" icon={Trash2} className="ml-auto text-danger" disabled={!!busy} onClick={() => setRemoving(s)}>
                    Remove
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove document?"
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} loading={!!busy} onClick={() => removing && remove(removing)}>
              Remove
            </Button>
          </>
        }
      >
        <p className="t-body">
          Remove <strong>{removing?.filename}</strong> from this activity? Values extracted from it will be removed; your manual entries are kept. The removal is recorded in the audit log.
        </p>
      </Modal>
    </section>
  );
}

/** Intake agent result for one document: a suggestion only — the uploaded type is never changed. */
function TypeCheck({ check }: { check: Bundle["agents"]["intake"][number] | undefined }) {
  if (!check) return null;
  if (check.suggested === check.uploadedAs)
    return (
      <p className="t-meta mt-2 flex items-center gap-1" data-testid="type-check">
        <FileSearch className="h-3 w-3" aria-hidden /> Type check: content matches “{SOURCE_KIND_LABELS[check.suggested]}”
      </p>
    );
  return (
    <p className="mt-2 flex items-start gap-1.5 rounded-md border border-warning-line bg-warning-soft px-2 py-1.5 text-[12.5px] text-warning" data-testid="type-check">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Uploaded as “{SOURCE_KIND_LABELS[check.uploadedAs]}”, but the content looks like: <strong>{SOURCE_KIND_LABELS[check.suggested]}</strong>
        {check.quote ? <> (“{check.quote.slice(0, 80)}”)</> : ` (${check.reason})`}. If so, remove it and upload it with the right type.
      </span>
    </p>
  );
}
