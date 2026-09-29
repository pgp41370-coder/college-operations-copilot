import type { Db } from "./types";

/**
 * Append-only audit trail. Details must never contain passwords, tokens or
 * document text — only identifiers, field keys and short values.
 */
export async function audit(
  sql: Db,
  entry: {
    actorId: string | null;
    action: string;
    activityId?: string | null;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
  },
) {
  await sql`
    insert into audit_logs (actor_id, activity_id, action, entity_type, entity_id, details)
    values (${entry.actorId}, ${entry.activityId ?? null}, ${entry.action}, ${entry.entityType ?? null},
            ${entry.entityId ?? null}, ${sql.json((entry.details ?? {}) as never)})`;
}

export const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "activity.created": "Created activity",
  "source.uploaded": "Uploaded document",
  "source.deleted": "Removed document",
  "source.caption_updated": "Updated document caption",
  "extraction.completed": "Extraction complete",
  "extraction.failed": "Extraction failed",
  "field.edited": "Field edited",
  "field.confirmed": "Field confirmed",
  "field.conflict_resolved": "Conflict resolved",
  "attendance.row_added": "Attendance row added",
  "attendance.row_updated": "Attendance row updated",
  "attendance.row_deleted": "Attendance row removed",
  "attendance.rows_verified": "Attendance rows verified",
  "attendance.csv_imported": "Attendance imported from CSV",
  "reconciliation.acknowledged": "Count mismatch acknowledged",
  "report.generated": "Reports generated",
  "activity.approved": "Activity approved",
  "activity.archived": "Activity archived",
  "activity.reopened": "Activity reopened",
  "export.downloaded": "Export downloaded",
  "template.saved": "Template saved",
  "user.created": "User created",
  "user.updated": "User updated",
  "account.password_changed": "Password changed",
  "ai.extraction": "LLM-assisted extraction",
};
