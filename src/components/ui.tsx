import type { ReactNode } from "react";

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PROCESSING: "Processing",
  REVIEW_REQUIRED: "Review required",
  READY_FOR_APPROVAL: "Ready for approval",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  PROCESSING: "bg-sky-50 text-sky-800 ring-sky-200",
  REVIEW_REQUIRED: "bg-amber-50 text-amber-800 ring-amber-200",
  READY_FOR_APPROVAL: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  APPROVED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  ARCHIVED: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const FIELD_STYLES: Record<string, [string, string]> = {
  extracted: ["Extracted", "bg-sky-50 text-sky-800 ring-sky-200"],
  user_entered: ["Entered by user", "bg-emerald-50 text-emerald-800 ring-emerald-200"],
  inferred: ["Inferred", "bg-violet-50 text-violet-800 ring-violet-200"],
  missing: ["Missing", "bg-slate-100 text-slate-600 ring-slate-200"],
  conflicting: ["Conflict — review required", "bg-red-50 text-red-700 ring-red-200"],
};

export function FieldStatusChip({ status }: { status: string }) {
  const [label, cls] = FIELD_STYLES[status] ?? [status, FIELD_STYLES.missing[1]];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{label}</span>;
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "red" | "green" | "blue" | "violet" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-900",
    red: "bg-red-100 text-red-800",
    green: "bg-emerald-100 text-emerald-800",
    blue: "bg-sky-100 text-sky-800",
    violet: "bg-violet-100 text-violet-800",
  };
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function MethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const map: Record<string, [string, "blue" | "violet" | "green" | "slate"]> = {
    deterministic_parser: ["Deterministic rule", "blue"],
    llm: ["LLM-assisted", "violet"],
    manual: ["Manual entry", "green"],
    pdf_text: ["PDF text layer", "blue"],
    ocr: ["OCR", "slate"],
    csv: ["CSV import", "slate"],
  };
  const [label, tone] = map[method] ?? [method, "slate"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return <div className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}

export const PRIVACY_NOTICE =
  "Do not upload confidential or personally identifiable information unless your institution has authorized its use.";

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
