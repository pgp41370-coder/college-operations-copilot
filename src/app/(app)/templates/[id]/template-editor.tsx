"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorText } from "@/components/client-api";
import { Notice } from "@/components/ui";

export function TemplateEditor({ id, json, canEdit }: { id: string; json: string; canEdit: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(json);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  return (
    <details className="card p-4">
      <summary className="t-card cursor-pointer">Definition (JSON){canEdit ? " — edit" : ""}</summary>
      <p className="t-meta mb-2 mt-2">{canEdit ? "Administrators can edit labels, required fields, letterhead, report rows and parser labels. The definition is validated before saving and saved as a new version." : "Read-only. Only administrators can edit the active version."}</p>
      <textarea className="input min-h-[60vh] font-mono text-xs" readOnly={!canEdit} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      {msg && <div className="mt-2"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {canEdit && (
        <button
          className="btn btn-primary mt-3"
          onClick={async () => {
            let definition: unknown;
            try {
              definition = JSON.parse(text);
            } catch {
              setMsg({ tone: "error", text: "This is not valid JSON." });
              return;
            }
            try {
              const r = await api<{ id: string }>(`/api/templates/${id}`, { method: "PUT", body: { definition } });
              setMsg({ tone: "success", text: "Saved as a new version." });
              router.push(`/templates/${r.id}`);
            } catch (e) {
              setMsg({ tone: "error", text: errorText(e) });
            }
          }}
        >
          Save as new version
        </button>
      )}
    </details>
  );
}
