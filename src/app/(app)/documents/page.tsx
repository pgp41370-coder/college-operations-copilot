import Link from "next/link";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { SOURCE_KIND_LABELS, type SourceKind } from "@/lib/templates/schema";
import { EmptyState, fmtBytes, fmtDateTime, PageHeader } from "@/components/ui";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const user = await requirePageUser();
  const rows = await getSql()<{ id: string; filename: string; kind: SourceKind; size_bytes: number; extraction_status: string; uploaded_at: Date; activity_id: string; title: string | null }[]>`
    select s.id, s.filename, s.kind, s.size_bytes, s.extraction_status, s.uploaded_at, a.id as activity_id, a.display_title as title
    from sources s join activities a on a.id = s.activity_id
    where ${user.role === "admin"} or a.owner_id = ${user.id}
    order by s.uploaded_at desc limit 500`;
  return (
    <>
      <PageHeader title="Documents" description="Every source document and evidence file you can access. Originals are stored privately and never modified." />
      {rows.length === 0 ? (
        <EmptyState title="No documents yet">Upload documents from an activity&apos;s Evidence step.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Document</th><th>Type</th><th>Activity</th><th>Size</th><th>Extraction</th><th>Uploaded</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/documents/${r.id}`} className="font-medium text-brand hover:underline">{r.filename}</Link></td>
                  <td>{SOURCE_KIND_LABELS[r.kind]}</td>
                  <td><Link href={`/activities/${r.activity_id}?tab=evidence`} className="hover:underline">{r.title ?? "Untitled activity"}</Link></td>
                  <td className="tabular-nums">{fmtBytes(r.size_bytes)}</td>
                  <td>{r.extraction_status}</td>
                  <td className="text-muted">{fmtDateTime(r.uploaded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
