import Link from "next/link";
import { FileStack, ListChecks, Search } from "lucide-react";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { SOURCE_KIND_LABELS, type SourceKind } from "@/lib/templates/schema";
import { Card, CardHeader, EmptyState, FileIcon, fmtDateTime, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Search" };

export default async function SearchPage(props: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePageUser();
  const q = ((await props.searchParams).q ?? "").trim().slice(0, 100);
  const sql = getSql();
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const activities = q
    ? await sql<{ id: string; display_title: string | null; status: string; updated_at: Date }[]>`
        select id, display_title, status, updated_at from activities
        where (${user.role === "admin"} or owner_id = ${user.id}) and display_title ilike ${like}
        order by updated_at desc limit 25`
    : [];
  const documents = q
    ? await sql<{ id: string; filename: string; kind: SourceKind; mime_type: string; activity_id: string; title: string | null }[]>`
        select s.id, s.filename, s.kind, s.mime_type, a.id as activity_id, a.display_title as title
        from sources s join activities a on a.id = s.activity_id
        where (${user.role === "admin"} or a.owner_id = ${user.id}) and s.filename ilike ${like}
        order by s.uploaded_at desc limit 25`
    : [];
  return (
    <>
      <PageHeader title="Search" description={q ? `Results for “${q}” in activities you can access.` : "Search activity titles and document names."} />
      {!q ? (
        <EmptyState icon={Search} title="Type in the search bar above">Activity titles and uploaded file names are searched.</EmptyState>
      ) : activities.length + documents.length === 0 ? (
        <EmptyState icon={Search} title="No matches">Nothing matches “{q}”. Try part of the activity title or a file name.</EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader icon={ListChecks} title={`Activities (${activities.length})`} />
            <ul className="divide-y divide-line">
              {activities.map((a) => (
                <li key={a.id}>
                  <Link href={`/activities/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium">{a.display_title ?? "Untitled activity"}</span>
                      <span className="t-meta">Updated {fmtDateTime(a.updated_at)}</span>
                    </span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
              {activities.length === 0 && <li className="t-meta px-4 py-4">No activity titles match.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader icon={FileStack} title={`Documents (${documents.length})`} />
            <ul className="divide-y divide-line">
              {documents.map((d) => (
                <li key={d.id}>
                  <Link href={`/documents/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <FileIcon mime={d.mime_type} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium">{d.filename}</span>
                      <span className="t-meta">{SOURCE_KIND_LABELS[d.kind]} · {d.title ?? "Untitled activity"}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {documents.length === 0 && <li className="t-meta px-4 py-4">No file names match.</li>}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
