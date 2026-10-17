"use client";
import { useState } from "react";
import { Bot, Check, CircleSlash, FileSearch, PenLine, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AgentRun, AgentStep } from "@/lib/server/agents";
import { SOURCE_KIND_LABELS } from "@/lib/templates/schema";
import { api, errorText } from "@/components/client-api";
import { Badge, Button, Card, CardHeader, fmtDateTime, Notice, type Tone } from "@/components/ui";
import type { TabProps } from "./workspace";

const STEP_LABEL: Record<AgentStep["agent"], string> = {
  intake: "1 · Intake — document types & missing documents",
  extraction: "2 · Extraction — values with a quote from the document",
  validation: "3 · Validation — conflicts & wrong-field values",
  drafting: "4 · Drafting — narrative from confirmed details",
};
const STEP_ICON = { intake: FileSearch, extraction: Bot, validation: ShieldCheck, drafting: PenLine };
const STATUS: Record<AgentStep["status"], [string, Tone]> = { done: ["Done", "success"], skipped: ["Skipped", "neutral"], failed: ["Failed", "danger"] };

type LastRun = { at: string; model: string | null; steps: AgentStep[] };

/** Runs the agent pipeline and shows what each agent did. Agents suggest; the reviewer decides. */
export function AgentsCard({ bundle, ai, locked, refresh }: TabProps) {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState<Record<string, boolean>>({});
  const last = bundle.audit.find((a) => a.action === "agents.run");
  const shown: LastRun | null = run ?? (last ? { at: last.created_at, model: (last.details.model as string | null) ?? null, steps: (last.details.steps as AgentStep[]) ?? [] } : null);
  const connected = ai.mode === "llm";

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setRun(await api<AgentRun>(`/api/activities/${bundle.activity.id}/agents`, { method: "POST" }));
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const acceptDraft = async (field: string, text: string) => {
    setError(null);
    try {
      await api(`/api/activities/${bundle.activity.id}/fields/${field}`, { body: { action: "set", value: text, note: "AI draft reviewed and accepted" } });
      setUsed((u) => ({ ...u, [field]: true }));
      refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const label = (key: string) => bundle.state.def.fields.find((f) => f.key === key)?.label ?? key;

  return (
    <Card>
      <CardHeader
        icon={Bot}
        title="Agent check"
        description={connected ? `AI model connected: ${ai.label}` : "No AI model connected here — rule-based agents run; model steps are skipped."}
        actions={
          <Button size="sm" variant="primary" icon={Play} loading={busy} disabled={busy} onClick={start}>
            {shown ? "Run again" : "Run agent check"}
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        {busy && <Notice tone="info">{connected ? "Agents are running. With a local model this can take a few minutes." : "Running…"}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {!shown && !busy && <p className="t-meta">Checks document types, missing documents and conflicts{connected ? ", extracts values with quotes and drafts empty narrative fields" : ""}. Nothing is approved or chosen for you.</p>}
        {shown && (
          <>
            <p className="t-meta">
              Last run {fmtDateTime(shown.at)}{shown.model ? ` · model ${shown.model}` : " · rules only"}
            </p>
            <ol className="space-y-2">
              {shown.steps.map((s) => {
                const Icon = STEP_ICON[s.agent];
                const [l, tone] = STATUS[s.status];
                return (
                  <li key={s.agent} className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[13px] font-medium">
                        {s.status === "skipped" ? <CircleSlash className="h-3.5 w-3.5 text-muted" aria-hidden /> : <Icon className="h-3.5 w-3.5 text-brand" aria-hidden />}
                        {STEP_LABEL[s.agent]}
                      </span>
                      <Badge tone={tone}>{l}</Badge>
                    </div>
                    <p className="mt-1 text-[12.5px] text-fg-2">{s.summary}</p>
                  </li>
                );
              })}
            </ol>
          </>
        )}
        {run && run.roleWarnings.length > 0 && (
          <div className="space-y-1.5">
            <p className="t-caption">Values that may belong to a different field</p>
            {run.roleWarnings.map((w) => (
              <p key={w.candidateId} className="flex items-start gap-2 text-[12.5px] text-warning">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {label(w.field)}: {w.value} — {w.reason || "the quote states something else"}
                  {w.evidence && <> (“{w.evidence}”)</>}
                </span>
              </p>
            ))}
          </div>
        )}
        {run && run.drafts.length > 0 && (
          <div className="space-y-2.5">
            <p className="t-caption">Drafts — read and edit before using</p>
            {run.drafts.map((d) => (
              <div key={d.field} className="rounded-lg border border-line bg-surface p-3">
                <p className="text-[13px] font-medium">{label(d.field)}</p>
                <p className="mt-1 text-[13px] leading-relaxed">{d.text}</p>
                <p className="t-meta mt-1">
                  Built only from: {[...new Set(d.sentences.flatMap((s) => s.uses))].map(label).join(", ")}
                  {d.dropped.length > 0 && ` · ${d.dropped.length} sentence(s) removed for unsupported details`}
                </p>
                {!locked && (
                  <div className="mt-2">
                    {used[d.field] ? (
                      <Badge tone="success" icon={Check}>Saved as your entry</Badge>
                    ) : (
                      <Button size="sm" icon={Check} onClick={() => acceptDraft(d.field, d.text)}>
                        Use this draft
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {run && run.intake.some((i) => i.suggested !== i.uploadedAs) && (
          <p className="t-meta">
            Possible wrong document type:{" "}
            {run.intake.filter((i) => i.suggested !== i.uploadedAs).map((i) => `${bundle.sources.find((s) => s.id === i.sourceId)?.filename ?? "a document"} looks like ${SOURCE_KIND_LABELS[i.suggested]}`).join("; ")}.
          </p>
        )}
      </div>
    </Card>
  );
}
