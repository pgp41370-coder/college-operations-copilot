"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, LayoutTemplate, PenLine, Signature, Users, type LucideIcon } from "lucide-react";
import type { TemplateField } from "@/lib/templates/schema";
import { api, errorText } from "@/components/client-api";
import { Button, Card, CardHeader, Notice, PrincipleStrip } from "@/components/ui";
import { FieldInput } from "../[id]/field-input";

const GROUPS: [TemplateField["group"], string, LucideIcon, string][] = [
  ["details", "Activity details", FileText, "What, when and where"],
  ["participants", "Participants", Users, "As stated in your report — checked later against attendance rows"],
  ["narrative", "Narrative", PenLine, "Brief, objectives and outcomes in your own words"],
  ["signatories", "Signatories", Signature, "Names printed under the signature spaces"],
  ["other", "Other", FileText, ""],
];

export function NewActivityForm({ templates }: { templates: { id: string; name: string; fields: TemplateField[] }[] }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = templates.find((x) => x.id === templateId);
  if (!t) return <Notice tone="error">No active template is configured. Ask an administrator.</Notice>;
  const filled = Object.values(values).filter((v) => v.trim()).length;
  return (
    <form
      className="grid gap-6 lg:grid-cols-[1fr_280px]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const { id } = await api<{ id: string }>("/api/activities", { body: { templateId, fields: values } });
          router.push(`/activities/${id}?tab=evidence`);
        } catch (err) {
          setError(errorText(err));
          setBusy(false);
        }
      }}
    >
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader icon={LayoutTemplate} title="Report template" description="Decides which fields are collected and how the reports are laid out." />
          <div className="p-4">
            <label className="label" htmlFor="tpl">Template</label>
            <select id="tpl" className="input max-w-md" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </div>
        </Card>
        {GROUPS.map(([g, label, icon, desc]) => {
          const fields = t.fields.filter((f) => f.group === g);
          if (!fields.length) return null;
          return (
            <Card key={g}>
              <CardHeader icon={icon} title={label} description={desc || undefined} />
              <fieldset className="grid gap-4 p-4 md:grid-cols-2">
                <legend className="sr-only">{label}</legend>
                {fields.map((f) => (
                  <div key={f.key} className={f.type === "longtext" ? "md:col-span-2" : ""}>
                    <label className="label" htmlFor={`f-${f.key}`}>
                      {f.label} {f.required && <span className="text-danger" title="Required before approval">*</span>}
                    </label>
                    <FieldInput id={`f-${f.key}`} field={f} value={values[f.key] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
                    {f.help && <p className="help">{f.help}</p>}
                  </div>
                ))}
              </fieldset>
            </Card>
          );
        })}
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card className="space-y-4 p-4">
          <div>
            <p className="t-caption">Next step</p>
            <p className="t-card mt-1">Upload evidence</p>
            <p className="t-meta mt-1">After creating, add the notice, attendance sheets and photographs. Text is read from them and every value keeps its source page.</p>
          </div>
          <p className="t-meta">
            <span className="t-num font-medium text-foreground">{filled}</span> of {t.fields.length} fields entered now.
          </p>
          <p className="t-meta"><span className="text-danger">*</span> Required before the activity can be approved (not required now).</p>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" variant="primary" className="w-full justify-center" loading={busy} disabled={busy}>
            {busy ? "Creating…" : "Create and continue to evidence"} {!busy && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
          </Button>
          <div className="border-t border-line pt-3">
            <PrincipleStrip className="flex-col items-start" />
          </div>
        </Card>
      </aside>
    </form>
  );
}
