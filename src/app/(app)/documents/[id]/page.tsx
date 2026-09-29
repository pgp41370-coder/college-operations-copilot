import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { getSourceForUser } from "@/lib/server/activities";
import { requirePageUser } from "@/lib/server/auth";
import { SOURCE_KIND_LABELS } from "@/lib/templates/schema";
import { Badge, fmtBytes, fmtDateTime, MethodBadge, Notice, PageHeader } from "@/components/ui";
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
      <PageHeader
        title={s.filename}
        description={<>{SOURCE_KIND_LABELS[s.kind]} · {fmtBytes(s.size_bytes)} · {s.page_count ?? 1} page(s) · uploaded by {s.uploaded_by_name ?? "unknown"} {fmtDateTime(s.uploaded_at)} · sha256 <code className="text-xs">{s.sha256.slice(0, 16)}…</code></>}
        actions={
          <>
            <Link className="btn btn-secondary" href={`/activities/${activity.id}?tab=evidence`}>Back to activity</Link>
            <a className="btn btn-secondary" href={`${fileUrl}?download=1`}>Download original</a>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          {s.mime_type === "application/pdf" ? (
            <iframe title={s.filename} src={`${fileUrl}#page=${focus}`} className="h-[80vh] w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt={s.caption ?? s.filename} className="w-full" />
          )}
        </div>
        <div className="space-y-4">
          {s.kind === "photo" ? (
            <>
              <Notice>Photographs are evidence attachments. The app does not read dates, places, people or counts from them.</Notice>
              <CaptionEditor id={s.id} caption={s.caption} sourceInfo={s.source_info} locked={locked} />
            </>
          ) : pages.length === 0 ? (
            <Notice tone="warn">No text has been extracted from this document yet. Run extraction from the activity&apos;s Evidence tab.</Notice>
          ) : (
            <>
              {cands.length > 0 && (
                <div className="card p-4">
                  <h2 className="mb-2 text-sm font-semibold">Values found in this document</h2>
                  <ul className="space-y-1 text-sm">
                    {cands.map((c, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <code className="text-xs">{c.field_key}</code>
                        <span className="font-medium">{c.value.slice(0, 120)}</span>
                        <span className="text-xs text-muted">p.{c.page} · {c.rule} · {Math.round(Number(c.confidence) * 100)}%</span>
                        <MethodBadge method={c.method} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pages.map((p) => (
                <details key={p.page} open={p.page === focus} className="card p-4">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Page {p.page} <MethodBadge method={p.method} /> {p.confidence != null && <Badge tone={Number(p.confidence) < 70 ? "amber" : "slate"}>OCR confidence {Number(p.confidence).toFixed(0)}%</Badge>}
                  </summary>
                  <div className="mt-1 text-xs text-muted">{p.engine} · {fmtDateTime(p.created_at)}</div>
                  <pre className="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-xs">{p.text || "(no text)"}</pre>
                </details>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
