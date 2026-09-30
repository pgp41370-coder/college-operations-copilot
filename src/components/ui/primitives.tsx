/**
 * Server-safe UI primitives (no hooks). Interactive pieces live in
 * interactive.tsx. All colours come from the design tokens in globals.css.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  CircleDashed,
  FileImage,
  FileText,
  FileType2,
  Info,
  Loader2,
  MinusCircle,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { TRUST_HELP, TRUST_LABEL, confidenceLevel, type TrustState } from "@/lib/trust";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- buttons */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";
export function btn(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "lg" && "btn-lg", extra);
}

export function Button({ variant = "secondary", size = "md", icon: Icon, loading, children, className, ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: Size; icon?: LucideIcon; loading?: boolean }) {
  return (
    <button className={btn(variant, size, className)} {...rest}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "secondary", size = "md", icon: Icon, children, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: LucideIcon }) {
  return (
    <Link className={btn(variant, size, className)} {...rest}>
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </Link>
  );
}

/* ----------------------------------------------------------------- badges */
export type Tone = "brand" | "success" | "warning" | "danger" | "info" | "neutral";
const TONE: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-strong ring-brand-line",
  success: "bg-success-soft text-success ring-success-line",
  warning: "bg-warning-soft text-warning ring-warning-line",
  danger: "bg-danger-soft text-danger ring-danger-line",
  info: "bg-info-soft text-info ring-info-line",
  neutral: "bg-neutral-soft text-neutral ring-neutral-line",
};
const DOT: Record<Tone, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-subtle",
};

export function Badge({ tone = "neutral", icon: Icon, dot, children, className, title }: { tone?: Tone; icon?: LucideIcon; dot?: boolean; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", TONE[tone], className)}>
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", DOT[tone])} aria-hidden />}
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse }: { tone?: Tone; pulse?: boolean }) {
  return <span className={cx("inline-block h-2 w-2 shrink-0 rounded-full", DOT[tone], pulse && "pulse-dot")} aria-hidden />;
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PROCESSING: "Processing",
  REVIEW_REQUIRED: "Needs review",
  READY_FOR_APPROVAL: "Ready for approval",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};
export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  PROCESSING: "info",
  REVIEW_REQUIRED: "warning",
  READY_FOR_APPROVAL: "brand",
  APPROVED: "success",
  ARCHIVED: "neutral",
};

/** Activity workflow status. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} dot>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const TRUST_TONE: Record<TrustState, Tone> = { verified: "success", source_backed: "info", needs_review: "warning", conflict: "danger", missing: "neutral" };
const TRUST_ICON: Record<TrustState, LucideIcon> = { verified: ShieldCheck, source_backed: FileText, needs_review: AlertTriangle, conflict: AlertOctagon, missing: MinusCircle };
export function TrustBadge({ state, label }: { state: TrustState; label?: string }) {
  return (
    <Badge tone={TRUST_TONE[state]} icon={TRUST_ICON[state]} title={TRUST_HELP[state]}>
      {label ?? TRUST_LABEL[state]}
    </Badge>
  );
}
export { TRUST_TONE, TRUST_ICON };

export function ConfidenceBadge({ value }: { value: number | null }) {
  const lvl = confidenceLevel(value);
  if (value == null || !lvl) return <span className="t-meta">—</span>;
  const tone: Tone = lvl === "high" ? "success" : lvl === "medium" ? "warning" : "danger";
  return (
    <Badge tone={tone} title="Rule confidence capped by OCR page confidence">
      <span className="t-num">{Math.round(value * 100)}%</span> · {lvl}
    </Badge>
  );
}

const METHOD: Record<string, [string, Tone]> = {
  deterministic_parser: ["Deterministic rule", "brand"],
  llm: ["LLM-assisted", "info"],
  manual: ["Manual entry", "success"],
  pdf_text: ["PDF text layer", "neutral"],
  ocr: ["OCR", "neutral"],
  csv: ["CSV import", "neutral"],
};
export function MethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const [label, tone] = METHOD[method] ?? [method, "neutral" as Tone];
  return <Badge tone={tone}>{label}</Badge>;
}

export function FileIcon({ mime, className }: { mime?: string | null; className?: string }) {
  const Icon = mime?.startsWith("image/") ? FileImage : mime === "application/pdf" ? FileType2 : FileText;
  return <Icon className={cx("h-4 w-4 shrink-0", mime?.startsWith("image/") ? "text-info" : "text-danger", className)} aria-hidden />;
}

/** Link to a source document page (provenance). */
export function SourceBadge({ sourceId, filename, page, mime }: { sourceId: string; filename: string; page?: number | null; mime?: string | null }) {
  return (
    <Link
      href={`/documents/${sourceId}${page ? `?page=${page}` : ""}`}
      className="focus-ring inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] text-fg-2 transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand-strong"
      title={`${filename}${page ? ` — page ${page}` : ""}`}
    >
      <FileIcon mime={mime} className="h-3.5 w-3.5" />
      <span className="truncate">{filename}</span>
      {page ? <span className="shrink-0 text-muted">p.{page}</span> : null}
    </Link>
  );
}

/* ------------------------------------------------------------------ cards */
export function Card({ children, className, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cx("card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, icon: Icon, actions, className }: { title: ReactNode; description?: ReactNode; icon?: LucideIcon; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-3 text-fg-2">
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="t-card">{title}</h3>
          {description && <p className="t-meta mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "neutral", href }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: Tone; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="t-meta font-medium text-fg-2">{label}</span>
        {Icon && (
          <span className={cx("flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset", TONE[tone])}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
      <div className="t-num mt-2 text-[26px] font-semibold leading-none tracking-tight">{value}</div>
      {hint && <div className="t-meta mt-1.5">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card card-hover focus-ring block p-4">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

/* ---------------------------------------------------------------- headers */
export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="t-caption mb-1.5">{eyebrow}</div>}
        <h1 className="t-page">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, description, actions, icon: Icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted" aria-hidden />}
        <div>
          <h2 className="t-section">{title}</h2>
          {description && <p className="t-meta">{description}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

/* ---------------------------------------------------------- empty / alerts */
export function EmptyState({ icon: Icon = CircleDashed, title, children, action, compact }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "card px-6 py-14")}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-3 text-muted ring-1 ring-line">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="t-card mt-3">{title}</p>
      {children && <div className="t-meta mt-1 max-w-md">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const CALLOUT_ICON: Record<"info" | "warn" | "error" | "success", LucideIcon> = { info: Info, warn: AlertTriangle, error: AlertOctagon, success: CheckCircle2 };
const CALLOUT_TONE: Record<"info" | "warn" | "error" | "success", string> = {
  info: "border-info-line bg-info-soft text-info",
  warn: "border-warning-line bg-warning-soft text-warning",
  error: "border-danger-line bg-danger-soft text-danger",
  success: "border-success-line bg-success-soft text-success",
};
export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "error" | "success"; title?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const Icon = CALLOUT_ICON[tone];
  return (
    <div role={tone === "error" ? "alert" : undefined} className={cx("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]", CALLOUT_TONE[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-fg-2">
        {title && <div className="mb-0.5 font-semibold text-foreground">{title}</div>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="t-caption">{i.label}</dt>
          <dd className="mt-0.5 truncate text-[13.5px]">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------ stepper / progress */
export type StepState = "done" | "current" | "todo" | "blocked";
export function Stepper({ steps, className }: { steps: { label: string; state: StepState; hint?: string; href?: string }[]; className?: string }) {
  const icon = (s: StepState, i: number) =>
    s === "done" ? (
      <Check className="h-3.5 w-3.5" aria-hidden />
    ) : s === "blocked" ? (
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
    ) : (
      <span className="text-[11px] font-semibold">{i + 1}</span>
    );
  const ring: Record<StepState, string> = {
    done: "bg-success text-white ring-success",
    current: "bg-brand text-white ring-brand shadow-[0_0_0_4px_var(--brand-soft)]",
    blocked: "bg-warning-soft text-warning ring-warning-line",
    todo: "bg-surface text-muted ring-line-strong",
  };
  return (
    <ol className={cx("flex flex-col gap-3 md:flex-row md:items-start md:gap-0", className)} aria-label="Workflow progress">
      {steps.map((s, i) => {
        const inner = (
          <>
            <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 transition-colors", ring[s.state])}>{icon(s.state, i)}</span>
            <span className="min-w-0 md:mt-2 md:text-center">
              <span className={cx("block text-[12.5px] font-medium", s.state === "todo" ? "text-muted" : "text-foreground")}>{s.label}</span>
              {s.hint && <span className="block text-[11px] leading-tight text-muted">{s.hint}</span>}
            </span>
          </>
        );
        return (
          <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="relative flex-1">
            {i < steps.length - 1 && (
              <span aria-hidden className={cx("absolute left-3 top-6 h-[calc(100%-12px)] w-px md:left-[calc(50%+14px)] md:top-3 md:h-px md:w-[calc(100%-28px)]", s.state === "done" ? "bg-success" : "bg-line-strong")} />
            )}
            {s.href ? (
              <Link href={s.href} scroll={false} className="focus-ring relative flex items-start gap-2.5 rounded-md md:flex-col md:items-center">
                {inner}
              </Link>
            ) : (
              <div className="relative flex items-start gap-2.5 md:flex-col md:items-center">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Real pipeline progress: each stage is done / active / pending / failed. */
export function ProgressIndicator({ stages }: { stages: { label: string; state: "done" | "active" | "pending" | "failed" | "skipped" }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" aria-label="Processing stages">
      {stages.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1.5">
          {s.state === "done" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
          ) : s.state === "active" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" aria-hidden />
          ) : s.state === "failed" ? (
            <AlertOctagon className="h-3.5 w-3.5 text-danger" aria-hidden />
          ) : (
            <Circle className="h-3.5 w-3.5 text-subtle" aria-hidden />
          )}
          <span className={cx(s.state === "active" ? "font-medium text-foreground" : s.state === "done" ? "text-fg-2" : s.state === "failed" ? "text-danger" : "text-subtle", s.state === "skipped" && "line-through")}>{s.label}</span>
          {i < stages.length - 1 && <span className="text-subtle" aria-hidden>→</span>}
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- timeline */
export interface TimelineItem {
  id: string;
  at: Date | string;
  actor: string;
  action: string;
  entity?: ReactNode;
  detail?: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
}
export function Timeline({ items }: { items: TimelineItem[] }) {
  const byDay = new Map<string, TimelineItem[]>();
  for (const it of items) {
    const d = new Date(it.at);
    const key = d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    byDay.set(key, [...(byDay.get(key) ?? []), it]);
  }
  return (
    <div className="space-y-6">
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day}>
          <h3 className="t-caption mb-2">{day}</h3>
          <ol className="relative ml-2 border-l border-line">
            {list.map((it) => {
              const Icon = it.icon ?? Circle;
              return (
                <li key={it.id} className="relative pb-3.5 pl-6 last:pb-0">
                  <span className={cx("absolute -left-[9px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-surface", TONE[it.tone ?? "neutral"])}>
                    <Icon className="h-2.5 w-2.5" aria-hidden />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <time className="t-num t-meta w-16 shrink-0 whitespace-nowrap" dateTime={new Date(it.at).toISOString()}>
                      {new Date(it.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </time>
                    <span className="text-[13px]">
                      <span className="font-medium">{it.actor}</span> <span className="text-fg-2">{it.action}</span>
                      {it.entity && <span className="text-fg-2"> · {it.entity}</span>}
                    </span>
                  </div>
                  {it.detail && <div className="t-meta ml-[4.5rem] mt-0.5 break-words">{it.detail}</div>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/* ----------------------------------------------------- product principle */
export function PrincipleStrip({ className }: { className?: string }) {
  const steps: [string, string][] = [
    ["AI assists", "reads text, proposes values"],
    ["Evidence supports", "every value cites a page"],
    ["Validation checks", "conflicts & gaps block approval"],
    ["Humans approve", "only a person can sign off"],
  ];
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted", className)} aria-label="How this product works">
      {steps.map(([a, b], i) => (
        <span key={a} className="flex items-center gap-1.5">
          <span className="font-medium text-fg-2">{a}</span>
          <span className="hidden text-subtle lg:inline">— {b}</span>
          {i < steps.length - 1 && <span className="text-subtle" aria-hidden>→</span>}
        </span>
      ))}
    </div>
  );
}
