import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Hash, ScanText } from "lucide-react";
import { getSql } from "@/lib/db";
import { getSourceForUser } from "@/lib/server/activities";
import { requirePageUser } from "@/lib/server/auth";
import { SOURCE_KIND_LABELS } from "@/lib/templates/schema";
import { Badge, Card, CardHeader, ConfidenceBadge, EmptyState, FileIcon, fmtBytes, fmtDateTime, MethodBadge, Notice } from "@/components/ui";
import { CaptionEditor } from "./caption-editor";

export const metadata = { title: "Document" };

export default async function DocumentPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const user = await requirePageUser();
  const { id } = await props.params;
  const { page } = await props.searchParams;
  const sql = getSql();
  const found = await getSourceForUser(sql, user, id).catch(() => null);
  if (!found) notFound();
  const { source: s, activity } = found;
  const pages = await sql<{ page: number; method: string; engine: string; text: string; confidence: string | null; created_at: Date }[]>`
    select page, method, engine, text, confidence, created_at from source_extractions where source_id = ${id} order by page`;
  const cands = await sql<{ field_key: string; value: string; page: number; rule: string; confidence: string; method: string }[]>`
    select field_key, value, page, rule, confidence, method from field_candidates where source_id = ${id} order by page, field_key`;
  const focus = Number(page) || 1;
  const fileUrl = `/api/sources/${s.id}/file`;
  const locked = activity.status === "APPROVED" || activity.status === "ARCHIVED";
  return (
    <>
      <div className="mb-5">
        <Link href={`/activities/${activity.id}?tab=evidence`} className="t-meta inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {activity.display_title ?? "Untitled activity"}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="t-page flex items-center gap-2 break-all">
              <FileIcon mime={s.mime_type} className="h-5 w-5" />
              {s.filename}
            </h1>
            <div className="t-meta mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge>{SOURCE_KIND_LABELS[s.kind]}</Badge>
              <span>{fmtBytes(s.size_bytes)}</span>
              <span>{s.page_count ?? 1} page(s)</span>
              <span>Uploaded by {s.uploaded_by_name ?? "unknown"} · {fmtDateTime(s.uploaded_at)}</span>
              <span className="flex items-center gap-1" title={s.sha256}>
                <Hash className="h-3 w-3" aria-hidden />
                sha256 <code className="font-mono text-[11px]">{s.sha256.slice(0, 16)}…</code>
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link className="btn btn-secondary" href={`/activities/${activity.id}?tab=evidence`}>Back to activity</Link>
            <a className="btn btn-secondary" href={`${fileUrl}?download=1`}>
              <Download className="h-3.5 w-3.5" aria-hidden /> Download original
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="t-meta">Original, as uploaded{s.mime_type === "application/pdf" ? ` · opened at page ${focus}` : ""}</span>
          </div>
          <div className="bg-surface-3">
            {s.mime_type === "application/pdf" ? (
              <iframe title={s.filename} src={`${fileUrl}#page=${focus}`} className="h-[78vh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl} alt={s.caption ?? s.filename} className="mx-auto max-h-[78vh] w-auto object-contain" />
            )}
          </div>
        </Card>
        <div className="min-w-0 space-y-4">
          {s.kind === "photo" ? (
            <>
              <Notice>Photographs are evidence attachments. The app does not read dates, places, people or counts from them.</Notice>
              <CaptionEditor id={s.id} caption={s.caption} sourceInfo={s.source_info} locked={locked} />
            </>
          ) : pages.length === 0 ? (
            <EmptyState icon={ScanText} title="No text extracted yet">Run extraction from the activity&apos;s Evidence tab.</EmptyState>
          ) : (
            <>
              {cands.length > 0 && (
                <Card>
                  <CardHeader title="Values found in this document" description={`${cands.length} candidate value(s). Each is reviewed on the activity's Review tab.`} />
                  <ul className="divide-y divide-line">
                    {cands.map((c, i) => (
                      <li key={i} className="px-4 py-2.5 text-[13px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <code className="font-mono text-[11px] text-muted">{c.field_key}</code>
                          <span className="flex items-center gap-1.5">
                            <Badge>p.{c.page}</Badge>
                            <MethodBadge method={c.method} />
                            <ConfidenceBadge value={Number(c.confidence)} />
                          </span>
                        </div>
                        <p className="mt-1 break-words font-medium">{c.value.slice(0, 160)}</p>
                        <p className="t-meta">rule {c.rule}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {pages.map((p) => (
                <details key={p.page} open={p.page === focus} className="card overflow-hidden">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3">
                    <span className="t-card">Page {p.page}</span>
                    <MethodBadge method={p.method} />
                    {p.confidence != null && <Badge tone={Number(p.confidence) < 70 ? "warning" : "neutral"}>OCR confidence {Number(p.confidence).toFixed(0)}%</Badge>}
                    <span className="t-meta ml-auto">{p.engine} · {fmtDateTime(p.created_at)}</span>
                  </summary>
                  <pre className="scroll-thin max-h-[50vh] overflow-auto whitespace-pre-wrap border-t border-line bg-surface-2 p-4 font-mono text-[12px] leading-relaxed text-fg-2">{p.text || "(no text)"}</pre>
                </details>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
