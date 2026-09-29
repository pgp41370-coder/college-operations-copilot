import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { getTemplateRow } from "@/lib/server/templates";
import { validateTemplateDefinition } from "@/lib/templates/schema";
import { PageHeader } from "@/components/ui";
import { TemplateEditor } from "./template-editor";

export const metadata = { title: "Template" };

export default async function TemplatePage(props: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await props.params;
  const t = await getTemplateRow(getSql(), id).catch(() => null);
  if (!t) notFound();
  const check = validateTemplateDefinition(t.definition);
  const def = check.ok ? check.definition : null;
  return (
    <>
      <PageHeader title={`${t.name} · v${t.version}`} description={t.derived_from ? `Derived from: ${t.derived_from}` : undefined} />
      {def && (
        <div className="card mb-6 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Field</th><th>Key</th><th>Type</th><th>Required for approval</th><th>Parser labels</th></tr></thead>
            <tbody>
              {def.fields.map((f) => (
                <tr key={f.key}><td>{f.label}</td><td className="font-mono text-xs">{f.key}</td><td>{f.type}</td><td>{f.required ? "Yes" : "No"}</td><td className="text-xs text-muted">{f.aliases.join(" · ") || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TemplateEditor id={t.id} json={JSON.stringify(t.definition, null, 2)} canEdit={user.role === "admin" && t.is_active} />
    </>
  );
}
