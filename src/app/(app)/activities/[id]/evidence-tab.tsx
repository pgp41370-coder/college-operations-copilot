"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { SOURCE_KINDS, SOURCE_KIND_LABELS, type SourceKind } from "@/lib/templates/schema";
import { api, ApiError, errorText } from "@/components/client-api";
import { Badge, fmtBytes, fmtDateTime, MethodBadge, Notice, PRIVACY_NOTICE } from "@/components/ui";
import type { Bundle } from "./types";
import type { WorkspaceProps } from "./workspace";

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

type Props = WorkspaceProps & { locked: boolean; refresh: () => void };
type Job = { name: string; message: string; fraction: number; error?: string; done?: boolean };

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

export function EvidenceTab({ bundle, locked, refresh }: Props) {
  const [kind, setKind] = useState<SourceKind>("notice");
  const [caption, setCaption] = useState("");
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const setJob = (key: string, j: Partial<Job>) => setJobs((s) => ({ ...s, [key]: { ...s[key], ...j } as Job }));

  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      setJob(key, { name: file.name, message: "Uploading", fraction: 0 });
      if (file.size > MAX_BYTES) {
        setJob(key, { error: `File is ${fmtBytes(file.size)}; the limit is 4 MB. Please upload a smaller scan (the original is not altered by this app).` });
        continue;
      }
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("kind", kind);
        if (caption.trim()) form.set("caption", caption.trim());
        const res = await fetch(`/api/activities/${bundle.activity.id}/sources`, { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status}).`);
        if (kind === "photo") {
          setJob(key, { message: "Uploaded (photographs are stored as evidence, not processed)", fraction: 1, done: true });
        } else {
          const r = await runExtraction(data.id, file, file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"), (m, f) => setJob(key, { message: m, fraction: f }));
          setJob(key, {
            message: r.status === "failed" ? "Could not extract text from this file. Enter its details manually." : `Extracted ${r.readablePages} page(s)${r.attendanceRows ? ` · ${r.attendanceRows} attendance rows drafted for review` : ""}`,
            fraction: 1,
            done: true,
            error: r.status === "failed" ? "Could not extract text from this file." : undefined,
          });
        }
      } catch (e) {
        setJob(key, { error: errorText(e) });
      }
      refresh();
    }
    setCaption("");
  }

  return (
    <div className="space-y-5">
      {!locked && (
        <div className="card p-4">
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <div>
              <label className="label" htmlFor="kind">Document type</label>
              <select id="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}>
                {SOURCE_KINDS.map((k) => <option key={k} value={k}>{SOURCE_KIND_LABELS[k]}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="caption">Caption (optional — shown under photographs in the packet)</label>
              <input id="caption" className="input" value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} />
            </div>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center ${dragOver ? "border-brand bg-brand/5" : "border-line"}`}
          >
            <p className="text-sm font-medium">Drop files here or <button className="text-brand underline" onClick={() => input.current?.click()}>choose files</button></p>
            <p className="mt-1 text-xs text-muted">PDF, JPG, JPEG or PNG · up to 4 MB each · uploaded as “{SOURCE_KIND_LABELS[kind]}”</p>
            <p className="mt-2 text-xs text-amber-800">{PRIVACY_NOTICE}</p>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Text is read in your browser: PDF text layers are used directly; scanned pages are OCR&apos;d with Tesseract (the OCR engine downloads once from a public CDN). Photographs are attachments only — nothing (date, place, people, counts) is inferred from them.
          </p>
        </div>
      )}
      {Object.entries(jobs).length > 0 && (
        <div className="space-y-2">
          {Object.entries(jobs).map(([k, j]) => (
            <div key={k} className={`rounded-md border px-3 py-2 text-sm ${j.error ? "border-red-200 bg-red-50" : "border-line bg-white"}`}>
              <div className="flex justify-between gap-3">
                <span className="font-medium">{j.name}</span>
                <span className={j.error ? "text-red-700" : "text-muted"}>{j.error ?? j.message}</span>
              </div>
              {!j.error && !j.done && <div className="mt-1.5 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-brand transition-all" style={{ width: `${Math.round(j.fraction * 100)}%` }} /></div>}
            </div>
          ))}
        </div>
      )}
      <SourceTable bundle={bundle} locked={locked} refresh={refresh} />
    </div>
  );
}

function SourceTable({ bundle, locked, refresh }: { bundle: Bundle; locked: boolean; refresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  if (!bundle.sources.length) return <Notice>No documents uploaded yet. Upload the notice/poster, attendance sheet, photographs and any existing report.</Notice>;
  const statusBadge = (s: Bundle["sources"][number]) => {
    const map: Record<string, [string, "slate" | "blue" | "green" | "red" | "amber"]> = {
      pending: ["Not processed", "amber"],
      processing: ["Processing…", "blue"],
      done: ["Text extracted", "green"],
      failed: ["Extraction failed", "red"],
      skipped: ["Evidence only", "slate"],
    };
    const [l, t] = map[s.extraction_status];
    return <Badge tone={t}>{l}</Badge>;
  };
  return (
    <div className="space-y-2">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Document</th><th>Type</th><th>Pages</th><th>Extraction</th><th>Uploaded</th><th></th></tr>
          </thead>
          <tbody>
            {bundle.sources.map((s) => (
              <tr key={s.id}>
                <td className="max-w-xs">
                  <Link className="font-medium text-brand hover:underline" href={`/documents/${s.id}`}>{s.filename}</Link>
                  <div className="text-xs text-muted">{fmtBytes(s.size_bytes)} · sha256 {s.sha256.slice(0, 10)}…</div>
                  {s.caption && <div className="text-xs">Caption: {s.caption}</div>}
                </td>
                <td className="whitespace-nowrap">{SOURCE_KIND_LABELS[s.kind]}</td>
                <td className="tabular-nums">{s.page_count ?? 1}</td>
                <td>
                  {statusBadge(s)}
                  <div className="mt-1 flex flex-wrap gap-1">{(s.methods ?? []).map((m) => <MethodBadge key={m} method={m} />)}</div>
                  {s.mean_confidence != null && <div className="text-xs text-muted">Mean OCR confidence {Number(s.mean_confidence).toFixed(0)}%</div>}
                  {s.extraction_error && <div className="text-xs text-red-700">{s.extraction_error}</div>}
                </td>
                <td className="whitespace-nowrap text-xs text-muted">{s.uploaded_by_name}<br />{fmtDateTime(s.uploaded_at)}</td>
                <td className="whitespace-nowrap text-right">
                  {!locked && s.kind !== "photo" && (
                    <button
                      className="btn btn-secondary btn-sm mr-1"
                      disabled={!!busy}
                      onClick={async () => {
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
                      }}
                    >
                      {s.extraction_status === "done" ? "Re-extract" : "Extract"}
                    </button>
                  )}
                  {!locked && (
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={!!busy}
                      onClick={async () => {
                        if (!confirm(`Remove ${s.filename} from this activity? Values extracted from it will be removed; your manual entries are kept.`)) return;
                        setBusy(s.id);
                        try {
                          await api(`/api/sources/${s.id}`, { method: "DELETE" });
                        } catch (e) {
                          setMsg({ tone: "error", text: errorText(e) });
                        } finally {
                          setBusy(null);
                          refresh();
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
