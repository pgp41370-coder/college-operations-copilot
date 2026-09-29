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

export { AUDIT_LABELS } from "../audit-labels";
