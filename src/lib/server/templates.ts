import type { User } from "./auth-core";
import { audit } from "./audit";
import { AppError, notFound } from "./errors";
import { validateTemplateDefinition } from "../templates/schema";
import type { Db } from "./types";

export async function listTemplates(sql: Db) {
  return sql<{ id: string; slug: string; version: number; name: string; description: string | null; derived_from: string | null; is_active: boolean; created_at: Date; activity_count: number }[]>`
    select t.id, t.slug, t.version, t.name, t.description, t.derived_from, t.is_active, t.created_at,
      (select count(*)::int from activities a where a.template_id = t.id) as activity_count
    from templates t order by t.slug, t.version desc`;
}

export async function getTemplateRow(sql: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Template");
  const [t] = await sql<{ id: string; slug: string; version: number; name: string; description: string | null; derived_from: string | null; definition: unknown; is_active: boolean }[]>`
    select id, slug, version, name, description, derived_from, definition, is_active from templates where id = ${id}`;
  if (!t) throw notFound("Template");
  return t;
}

/**
 * Saving a template creates a new version; existing activities keep the
 * version they were created with, so approved reports never change.
 */
export async function saveTemplateVersion(sql: Db, user: User, baseId: string, definition: unknown): Promise<string> {
  if (user.role !== "admin") throw new AppError(403, "Administrator access required.");
  const base = await getTemplateRow(sql, baseId);
  const check = validateTemplateDefinition(definition);
  if (!check.ok) throw new AppError(400, "Template definition is invalid.", check.errors);
  return sql.begin(async (tx) => {
    const [{ v }] = await tx<{ v: number }[]>`select coalesce(max(version), 0) + 1 as v from templates where slug = ${base.slug}`;
    await tx`update templates set is_active = false where slug = ${base.slug}`;
    const [t] = await tx<{ id: string }[]>`
      insert into templates (slug, version, name, description, derived_from, definition, created_by)
      values (${base.slug}, ${v}, ${base.name}, ${base.description}, ${`${base.slug} v${base.version} (edited)`}, ${tx.json(check.definition as never)}, ${user.id})
      returning id`;
    await audit(tx, { actorId: user.id, action: "template.saved", entityType: "template", entityId: t.id, details: { slug: base.slug, version: v } });
    return t.id;
  }) as Promise<string>;
}
