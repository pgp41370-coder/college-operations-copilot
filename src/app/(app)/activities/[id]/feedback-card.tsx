"use client";
import { useState } from "react";
import { CheckCircle2, MessageSquareText, Pencil, Send, Star } from "lucide-react";
import { api, errorText } from "@/components/client-api";
import { Button, Card, CardHeader, cx, fmtDateTime, Notice, useToast } from "@/components/ui";

export interface MyFeedback {
  rating: number;
  worked_well: string | null;
  difficult: string | null;
  report_corrections: "none" | "minor" | "major";
  manual_effort: "little" | "some" | "most";
  would_use_again: "yes" | "maybe" | "no";
  updated_at: string;
}

const CORRECTIONS = [
  ["none", "No corrections"],
  ["minor", "Minor corrections"],
  ["major", "Major corrections"],
] as const;
const EFFORT = [
  ["little", "Very little"],
  ["some", "Some"],
  ["most", "Most of it"],
] as const;
const AGAIN = [
  ["yes", "Yes"],
  ["maybe", "Maybe"],
  ["no", "No"],
] as const;
const RATING_HINT = ["", "Very poor", "Poor", "Okay", "Good", "Very good"];

function Choice<T extends string>({ name, label, options, value, onChange }: { name: string; label: string; options: readonly (readonly [T, string])[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <label
            key={v}
            className={cx(
              "focus-within:ring-brand-line cursor-pointer rounded-lg border px-3 py-1.5 text-[13px] transition-colors focus-within:ring-2",
              value === v ? "border-brand bg-brand-soft font-medium text-brand-strong" : "border-line-strong bg-surface text-fg-2 hover:border-subtle",
            )}
          >
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Pilot feedback, asked once an activity is approved. One response per person, editable. */
export function FeedbackCard({ activityId, existing, onSaved }: { activityId: string; existing: MyFeedback | null; onSaved: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(!existing);
  const [rating, setRating] = useState<number>(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [workedWell, setWorkedWell] = useState(existing?.worked_well ?? "");
  const [difficult, setDifficult] = useState(existing?.difficult ?? "");
  const [corrections, setCorrections] = useState<MyFeedback["report_corrections"] | null>(existing?.report_corrections ?? null);
  const [effort, setEffort] = useState<MyFeedback["manual_effort"] | null>(existing?.manual_effort ?? null);
  const [again, setAgain] = useState<MyFeedback["would_use_again"] | null>(existing?.would_use_again ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = rating > 0 && corrections && effort && again;

  if (existing && !editing) {
    return (
      <Card data-testid="feedback-card">
        <CardHeader icon={MessageSquareText} title="Your pilot feedback" description={`Saved ${fmtDateTime(existing.updated_at)}`} actions={<Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>} />
        <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Thank you — your feedback was recorded ({existing.rating}/5).
        </div>
      </Card>
    );
  }

  return (
    <Card data-testid="feedback-card">
      <CardHeader icon={MessageSquareText} title="How was your experience?" description="Pilot feedback. Your answers help decide what to improve next. Only administrators can see them." />
      <form
        className="space-y-4 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!complete) return;
          setBusy(true);
          setError(null);
          try {
            await api(`/api/activities/${activityId}/feedback`, {
              body: { rating, workedWell, difficult, reportCorrections: corrections, manualEffort: effort, wouldUseAgain: again },
            });
            toast({ tone: "success", title: "Feedback saved", body: "Thank you." });
            setEditing(false);
            onSaved();
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset>
          <legend className="label">Overall rating</legend>
          <div role="radiogroup" aria-label="Overall rating, 1 to 5" className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => {
              const on = (hover || rating) >= n;
              return (
                <label key={n} className="cursor-pointer rounded-md p-0.5 focus-within:ring-2 focus-within:ring-brand-line" onMouseEnter={() => setHover(n)}>
                  <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" aria-label={`${n} out of 5`} />
                  <Star className={cx("h-7 w-7 transition-colors", on ? "fill-warning text-warning" : "text-line-strong")} aria-hidden />
                </label>
              );
            })}
            <span className="t-meta ml-2 min-w-20">{RATING_HINT[hover || rating] ?? ""}</span>
          </div>
        </fieldset>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="fb-good">What worked well?</label>
            <textarea id="fb-good" className="input min-h-20" maxLength={2000} value={workedWell} onChange={(e) => setWorkedWell(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="fb-hard">What was difficult?</label>
            <textarea id="fb-hard" className="input min-h-20" maxLength={2000} value={difficult} onChange={(e) => setDifficult(e.target.value)} />
          </div>
        </div>
        <Choice name="corrections" label="Did the generated report require corrections?" options={CORRECTIONS} value={corrections} onChange={setCorrections} />
        <Choice name="effort" label="How much manual work did you still need to do?" options={EFFORT} value={effort} onChange={setEffort} />
        <Choice name="again" label="Would you use this for your next activity?" options={AGAIN} value={again} onChange={setAgain} />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" icon={Send} loading={busy} disabled={busy || !complete}>
            Submit feedback
          </Button>
          {existing && <Button type="button" onClick={() => setEditing(false)}>Cancel</Button>}
          {!complete && <span className="t-meta">Rating and the three choices are required; comments are optional.</span>}
        </div>
      </form>
    </Card>
  );
}
