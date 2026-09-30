import Link from "next/link";
import { FileStack, Search } from "lucide-react";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { SOURCE_KINDS, SOURCE_KIND_LABELS, type SourceKind } from "@/lib/templates/schema";
import { Badge, EmptyState, FileIcon, fmtBytes, fmtDateTime, fmtRelative, PageHeader, type Tone } from "@/components/ui";

export const metadata = { title: "Documents" };

const STATUS: Record<string, [string, Tone]> = {
  pending: ["Not processed", "warning"],
  processing: ["Processing", "info"],
  done: ["Text extracted", "success"],
  failed: ["Extraction failed", "danger"],
  skipped: ["Evidence only", "neutral"],
};

export default async function DocumentsPage(props: { searchParams: Promise<{ q?: string; kind?: string; status?: string }> }) {
  const user = await requirePageUser();
  const { q, kind, status } = await props.searchParams;
  const all = await getSql()<{ id: string; filename: string; kind: SourceKind; mime_type: string; size_bytes: number; page_count: number | null; extraction_status: string; uploaded_at: Date; activity_id: string; title: string | null; pages: number }[]>`
    select s.id, s.filename, s.kind, s.mime_type, s.size_bytes, s.page_count, s.extraction_status, s.uploaded_at, a.id as activity_id, a.display_title as title,
      (select count(*)::int from source_extractions e where e.source_id = s.id) as pages
    from sources s join activities a on a.id = s.activity_id
    where ${user.role === "admin"} or a.owner_id = ${user.id}
    order by s.uploaded_at desc limit 500`;
  const needle = q?.trim().toLowerCase() ?? "";
  const rows = all.filter(
    (r) =>
      (!kind || r.kind === kind) &&
      (!status || r.extraction_status === status) &&
      (!needle || r.filename.toLowerCase().includes(needle) || (r.title ?? "").toLowerCase().includes(needle)),
  );
  const filtered = !!(needle || kind || status);
  return (
    <>
      <PageHeader title="Documents" description="Every source document and evidence file you can access. Originals are stored privately and never modified." />
      <form action="/documents" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Search file name or activity" aria-label="Search documents" className="input pl-8" />
        </div>
        <select name="kind" defaultValue={kind ?? ""} aria-label="Document type" className="input w-auto">
          <option value="">All types</option>
          {SOURCE_KINDS.map((k) => (
            <option key={k} value={k}>{SOURCE_KIND_LABELS[k]}</option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} aria-label="Extraction status" className="input w-auto">
          <option value="">Any extraction status</option>
          {Object.entries(STATUS).map(([k, [l]]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <button className="btn btn-secondary">Apply</button>
        {filtered && <Link href="/documents" className="btn btn-ghost">Clear</Link>}
        <span className="t-meta ml-auto self-center">{rows.length} of {all.length} documents</span>
      </form>
      {all.length === 0 ? (
        <EmptyState icon={FileStack} title="No documents yet">Upload documents from an activity&apos;s Evidence step.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={Search} title="No documents match these filters" action={<Link href="/documents" className="btn btn-secondary">Clear filters</Link>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Activity</th>
                <th className="text-right">Pages</th>
                <th>Extraction</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [l, t] = STATUS[r.extraction_status] ?? [r.extraction_status, "neutral" as Tone];
                return (
                  <tr key={r.id}>
                    <td className="max-w-xs">
                      <Link href={`/documents/${r.id}`} className="flex items-center gap-2 font-medium hover:text-brand">
                        <FileIcon mime={r.mime_type} />
                        <span className="truncate">{r.filename}</span>
                      </Link>
                      <span className="t-meta ml-6">{fmtBytes(r.size_bytes)}</span>
                    </td>
                    <td className="whitespace-nowrap text-fg-2">{SOURCE_KIND_LABELS[r.kind]}</td>
                    <td className="max-w-[240px]">
                      <Link href={`/activities/${r.activity_id}?tab=evidence`} className="block truncate text-fg-2 hover:text-brand">
                        {r.title ?? "Untitled activity"}
                      </Link>
                    </td>
                    <td className="t-num text-right">{r.page_count ?? 1}</td>
                    <td><Badge tone={t} dot>{l}</Badge></td>
                    <td className="t-meta whitespace-nowrap" title={fmtDateTime(r.uploaded_at)}>{fmtRelative(r.uploaded_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
