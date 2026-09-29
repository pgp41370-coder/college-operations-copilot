import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { loadTemplate } from "@/lib/server/activities";
import { PageHeader } from "@/components/ui";
import { NewActivityForm } from "./new-activity-form";

export const metadata = { title: "Create activity" };

export default async function NewActivityPage() {
  await requirePageUser();
  const sql = getSql();
  const templates = await sql<{ id: string; name: string; version: number }[]>`select id, name, version from templates where is_active order by name`;
  const loaded = await Promise.all(templates.map((t) => loadTemplate(sql, t.id)));
  return (
    <>
      <PageHeader
        title="Create activity"
        description="Step 1 of the workflow. Enter what you know now — every field is optional here. Anything left blank can be extracted from uploaded documents in the next step or entered later. Nothing is filled in for you."
      />
      <NewActivityForm templates={loaded.map((t) => ({ id: t.id, name: `${t.name} (v${t.version})`, fields: t.def.fields }))} />
    </>
  );
}
