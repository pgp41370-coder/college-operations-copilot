/**
 * What stands between an activity and approval. Blocking issues prevent
 * approval; warnings are shown but do not block.
 */
import type { FieldStatus } from "./fields/resolve";
import type { Reconciliation } from "./reconciliation";
import type { TemplateDefinition } from "./templates/schema";

export interface Issue {
  code:
    | "required_missing"
    | "conflict"
    | "low_confidence"
    | "reconciliation_failed"
    | "reports_missing"
    | "reports_stale"
    | "extraction_running"
    | "extraction_failed"
    | "reconciliation_unverified"
    | "attendance_missing";
  message: string;
  field?: string;
}

export interface FieldState {
  value: string | null;
  status: FieldStatus;
  confidence: number | null;
  editedBy: string | null;
}

export const LOW_CONFIDENCE = 0.8;

export interface ReadinessInput {
  def: TemplateDefinition;
  fields: Record<string, FieldState | undefined>;
  reconciliation: Reconciliation;
  reconciliationAcknowledged: boolean;
  sources: { filename: string; extractionStatus: string; kind: string }[];
  reportsGeneratedAt: Date | null;
  fieldsUpdatedAt: Date;
}

export function assessReadiness(input: ReadinessInput): { blocking: Issue[]; warnings: Issue[] } {
  const { def, fields } = input;
  const blocking: Issue[] = [];
  const warnings: Issue[] = [];

  for (const f of def.fields) {
    const s = fields[f.key];
    if (s?.status === "conflicting") {
      blocking.push({ code: "conflict", field: f.key, message: `${f.label}: documents contain different values — review required.` });
      continue;
    }
    const empty = !s || s.value == null || s.value === "";
    if (f.required && empty) {
      blocking.push({ code: "required_missing", field: f.key, message: `${f.label} is required and has not been provided.` });
      continue;
    }
    if (!empty && s && s.status === "extracted" && !s.editedBy && (s.confidence ?? 0) < LOW_CONFIDENCE) {
      blocking.push({
        code: "low_confidence",
        field: f.key,
        message: `${f.label}: low-confidence extraction — confirm or correct it.`,
      });
    }
  }

  if (input.reconciliation.overall === "FAIL") {
    if (input.reconciliationAcknowledged) {
      warnings.push({ code: "reconciliation_failed", message: "Participant totals do not reconcile (acknowledged by reviewer)." });
    } else {
      blocking.push({
        code: "reconciliation_failed",
        message: "Participant totals do not reconcile. Correct the counts/attendance or record an acknowledgement.",
      });
    }
  } else if (input.reconciliation.overall === "UNVERIFIED") {
    warnings.push({ code: "reconciliation_unverified", message: "Counts agree, but some attendance rows are not verified." });
  }

  if (input.reconciliation.attendance.rows === 0) {
    warnings.push({ code: "attendance_missing", message: "No attendance rows recorded — participant counts cannot be cross-checked." });
  }

  for (const s of input.sources) {
    if (s.extractionStatus === "processing") {
      blocking.push({ code: "extraction_running", message: `Extraction still running for ${s.filename}.` });
    } else if (s.extractionStatus === "failed") {
      warnings.push({ code: "extraction_failed", message: `Could not extract text from ${s.filename}. Enter its details manually.` });
    }
  }

  if (!input.reportsGeneratedAt) {
    blocking.push({ code: "reports_missing", message: "Reports have not been generated yet." });
  } else if (input.reportsGeneratedAt < input.fieldsUpdatedAt) {
    blocking.push({ code: "reports_stale", message: "Details changed after the reports were generated — regenerate before approval." });
  }

  return { blocking, warnings };
}
