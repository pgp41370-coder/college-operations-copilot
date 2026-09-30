"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorText } from "@/components/client-api";

export function CaptionEditor({ id, caption, sourceInfo, locked }: { id: string; caption: string | null; sourceInfo: string | null; locked: boolean }) {
  const router = useRouter();
  const [c, setC] = useState(caption ?? "");
  const [s, setS] = useState(sourceInfo ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="card space-y-3 p-4">
      <h2 className="t-card">Caption</h2>
      <div>
        <label className="label" htmlFor="cap">Caption (entered by you)</label>
        <input id="cap" className="input" disabled={locked} value={c} maxLength={300} onChange={(e) => setC(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="src">Source information (optional, e.g. who took the photo)</label>
        <input id="src" className="input" disabled={locked} value={s} maxLength={300} onChange={(e) => setS(e.target.value)} />
      </div>
      {!locked && (
        <button
          className="btn btn-primary btn-sm"
          onClick={async () => {
            try {
              await api(`/api/sources/${id}`, { method: "PATCH", body: { caption: c, sourceInfo: s } });
              setMsg("Saved.");
              router.refresh();
            } catch (e) {
              setMsg(errorText(e));
            }
          }}
        >
          Save
        </button>
      )}
      {msg && <p className="t-meta" role="status">{msg}</p>}
    </div>
  );
}
