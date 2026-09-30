import Link from "next/link";
import { ArrowRight, LayoutTemplate } from "lucide-react";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { listTemplates } from "@/lib/server/templates";
import { Badge, EmptyState, fmtDateTime, PageHeader } from "@/components/ui";

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
      {rows.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No templates">Run the database seed to install the default template.</EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href={`/templates/${t.id}`} className="card card-hover flex h-full flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand-line">
                    <LayoutTemplate className="h-4 w-4" aria-hidden />
                  </span>
                  {t.is_active ? <Badge tone="success" dot>Active</Badge> : <Badge>Previous version</Badge>}
                </div>
                <h2 className="t-card mt-3">{t.name}</h2>
                <p className="t-meta mt-0.5">v{t.version} · {t.slug}</p>
                {t.description && <p className="mt-2 line-clamp-3 text-[13px] text-fg-2">{t.description}</p>}
                {t.derived_from && <p className="t-meta mt-2 line-clamp-2">Derived from: {t.derived_from}</p>}
                <div className="t-meta mt-auto flex items-center justify-between border-t border-line pt-3">
                  <span>{t.activity_count} activit{t.activity_count === 1 ? "y" : "ies"} · {fmtDateTime(t.created_at)}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
