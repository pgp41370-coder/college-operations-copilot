import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, ListTree, Package, Signature, Tags } from "lucide-react";
import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { getTemplateRow } from "@/lib/server/templates";
import { SOURCE_KIND_LABELS, validateTemplateDefinition, type TemplateField } from "@/lib/templates/schema";
import { Badge, Card, CardHeader, Notice } from "@/components/ui";
import { TemplateEditor } from "./template-editor";

export const metadata = { title: "Template" };

const GROUPS: [TemplateField["group"], string][] = [
  ["details", "Activity details"],
  ["participants", "Participants"],
  ["narrative", "Narrative"],
  ["signatories", "Signatories"],
  ["other", "Other"],
];
const PACKET_LABEL: Record<string, string> = { generated_activity_report: "Generated Activity Report", generated_detailed_report: "Generated Detailed Report", ...SOURCE_KIND_LABELS };

export default async function TemplatePage(props: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await props.params;
  const t = await getTemplateRow(getSql(), id).catch(() => null);
  if (!t) notFound();
  const check = validateTemplateDefinition(t.definition);
  const def = check.ok ? check.definition : null;
  const labelOf = (k: string) => def?.fields.find((f) => f.key === k)?.label ?? k;
  return (
    <>
      <div className="mb-6">
        <Link href="/templates" className="t-meta inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Templates
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="t-page">{t.name}</h1>
          <Badge>v{t.version}</Badge>
          {t.is_active ? <Badge tone="success" dot>Active</Badge> : <Badge>Previous version</Badge>}
        </div>
        {t.derived_from && <p className="t-meta mt-1">Derived from: {t.derived_from}</p>}
      </div>

      {!def ? (
        <Notice tone="error" title="This definition does not validate">{!check.ok && check.errors.slice(0, 5).join(" · ")}</Notice>
      ) : (
        <div className="mb-6 grid gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader icon={ListTree} title="Fields" description={`${def.fields.length} fields · ${def.fields.filter((f) => f.required).length} required before approval · dates as ${def.dateFormat}`} />
            {GROUPS.map(([g, label]) => {
              const fields = def.fields.filter((f) => f.group === g);
              if (!fields.length) return null;
              return (
                <section key={g} className="border-b border-line last:border-0">
                  <h3 className="t-caption bg-surface-2 px-4 py-2">{label}</h3>
                  <ul className="divide-y divide-line">
                    {fields.map((f) => (
                      <li key={f.key} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[1fr_auto] sm:items-start">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-medium">{f.label}</span>
                            {f.required && <Badge tone="warning">Required</Badge>}
                          </div>
                          <div className="t-meta mt-0.5 flex flex-wrap gap-x-2">
                            <code className="font-mono text-[11px]">{f.key}</code>
                            {f.aliases.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Tags className="h-3 w-3" aria-hidden /> Parser labels: {f.aliases.join(" · ")}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge>{f.type}</Badge>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </Card>
          <div className="space-y-5">
            <Card>
              <CardHeader icon={FileText} title="Activity Report" description={def.activityReport.heading} />
              <ol className="space-y-1 px-4 py-3 text-[13px]">
                {[...def.activityReport.detailRows, ...def.activityReport.narrativeRows].map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="t-num w-5 shrink-0 text-subtle">{i + 1}</span>
                    <span>{r.label}</span>
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <CardHeader icon={FileText} title="Detailed Report" description={def.detailedReport.heading} />
              <dl className="space-y-1.5 px-4 py-3 text-[13px]">
                <div className="flex justify-between gap-3"><dt className="text-muted">Topic</dt><dd className="text-right">{labelOf(def.detailedReport.topicField)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Description</dt><dd className="text-right">{labelOf(def.detailedReport.descriptionField)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{def.detailedReport.impactHeading}</dt><dd className="text-right">{labelOf(def.detailedReport.impactField)}</dd></div>
              </dl>
            </Card>
            <Card>
              <CardHeader icon={Signature} title="Signatories" />
              <ul className="space-y-1 px-4 py-3 text-[13px]">
                {def.activityReport.signatories.map((s) => (
                  <li key={s.heading}>{s.heading}</li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader icon={Package} title="Activity packet order" />
              <ol className="space-y-1 px-4 py-3 text-[13px]">
                {def.packet.sections.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="t-num w-5 shrink-0 text-subtle">{i + 1}</span>
                    <span>{s.heading ?? PACKET_LABEL[s.include] ?? s.include}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      )}
      <TemplateEditor id={t.id} json={JSON.stringify(t.definition, null, 2)} canEdit={user.role === "admin" && t.is_active} />
    </>
  );
}
