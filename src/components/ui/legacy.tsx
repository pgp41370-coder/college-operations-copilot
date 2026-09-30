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

