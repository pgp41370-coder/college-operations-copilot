"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TemplateField } from "@/lib/templates/schema";
import { api, errorText } from "@/components/client-api";
import { FieldInput } from "../[id]/field-input";

const GROUPS: [TemplateField["group"], string][] = [
  ["details", "Activity details"],
  ["participants", "Participants (as stated in your report)"],
  ["narrative", "Narrative"],
  ["signatories", "Signatories"],
  ["other", "Other"],
];

export function NewActivityForm({ templates }: { templates: { id: string; name: string; fields: TemplateField[] }[] }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = templates.find((x) => x.id === templateId);
  if (!t) return <p className="text-sm text-red-700">No active template is configured. Ask an administrator.</p>;
  return (
    <form
      className="space-y-6"
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
      <div className="card max-w-xl p-4">
        <label className="label" htmlFor="tpl">Report template</label>
        <select id="tpl" className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      {GROUPS.map(([g, label]) => {
        const fields = t.fields.filter((f) => f.group === g);
        if (!fields.length) return null;
        return (
          <fieldset key={g} className="card p-4">
            <legend className="px-1 text-sm font-semibold">{label}</legend>
            <div className="grid gap-4 md:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key} className={f.type === "longtext" ? "md:col-span-2" : ""}>
                  <label className="label" htmlFor={`f-${f.key}`}>
                    {f.label} {f.required && <span className="text-red-700" title="Required before approval">*</span>}
                  </label>
                  <FieldInput id={`f-${f.key}`} field={f} value={values[f.key] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
                  {f.help && <p className="mt-1 text-xs text-muted">{f.help}</p>}
                </div>
              ))}
            </div>
          </fieldset>
        );
      })}
      <p className="text-xs text-muted"><span className="text-red-700">*</span> Required before the activity can be approved (not required now).</p>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create and continue to evidence"}</button>
      </div>
    </form>
  );
}
