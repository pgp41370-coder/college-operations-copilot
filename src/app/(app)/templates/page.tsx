import Link from "next/link";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { listTemplates } from "@/lib/server/templates";
import { Badge, fmtDateTime, PageHeader } from "@/components/ui";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  await requirePageUser();
  const rows = await listTemplates(getSql());
  return (
    <>
      <PageHeader
        title="Report templates"
        description="Templates define the fields, labels, report layout and parser labels. They are configuration, not code: another department or college can use its own template. Editing creates a new version; existing activities keep the version they started with."
      />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Template</th><th>Version</th><th>Derived from</th><th>Activities</th><th>Created</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td><Link className="font-medium text-brand hover:underline" href={`/templates/${t.id}`}>{t.name}</Link> {t.is_active ? <Badge tone="green">Active</Badge> : <Badge>Previous version</Badge>}<div className="text-xs text-muted">{t.description}</div></td>
                <td className="tabular-nums">v{t.version}</td>
                <td className="text-xs text-muted">{t.derived_from}</td>
                <td className="tabular-nums">{t.activity_count}</td>
                <td className="text-muted">{fmtDateTime(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
