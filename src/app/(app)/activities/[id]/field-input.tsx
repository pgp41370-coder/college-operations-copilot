"use client";
import type { TemplateField } from "@/lib/templates/schema";

/** Typed input for a template field. Dates/times use native pickers (ISO values). */
export function FieldInput({ id, field, value, onChange }: { id: string; field: TemplateField; value: string; onChange: (v: string) => void }) {
  if (field.type === "longtext") {
    return <textarea id={id} className="input min-h-28" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  const type = field.type === "date" ? "date" : field.type === "time" ? "time" : field.type === "integer" ? "number" : "text";
  return <input id={id} className="input" type={type} min={field.type === "integer" ? 0 : undefined} value={value} onChange={(e) => onChange(e.target.value)} />;
}
