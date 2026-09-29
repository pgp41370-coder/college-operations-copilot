import type postgres from "postgres";
import { KDK_MECH_V1 } from "./kdk-mech-v1";
import { validateTemplateDefinition } from "./schema";

const BUILT_IN = [
  {
    slug: "kdk-mech-activity",
    version: 1,
    name: "KDK Mechanical — Activity Report + Detailed Report",
    description:
      "Structured activity report and narrative REPORT as used by the Department of Mechanical Engineering, K.D.K. College of Engineering, Nagpur.",
    derivedFrom:
      "Two KDK Mechanical activity packets (reference-data/, session 2024-25)",
    definition: KDK_MECH_V1,
  },
];

/** Inserts built-in templates that do not exist yet. Never overwrites edits. */
export async function seedTemplates(sql: postgres.Sql): Promise<string[]> {
  const inserted: string[] = [];
  for (const t of BUILT_IN) {
    const check = validateTemplateDefinition(t.definition);
    if (!check.ok) throw new Error(`built-in template ${t.slug} invalid: ${check.errors.join("; ")}`);
    const rows = await sql`
      insert into templates (slug, version, name, description, derived_from, definition)
      values (${t.slug}, ${t.version}, ${t.name}, ${t.description}, ${t.derivedFrom}, ${sql.json(t.definition as never)})
      on conflict (slug, version) do nothing
      returning slug`;
    if (rows.length) inserted.push(`${t.slug}@${t.version}`);
  }
  return inserted;
}
