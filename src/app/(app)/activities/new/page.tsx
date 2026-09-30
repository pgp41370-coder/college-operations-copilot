import { getSql } from "@/lib/db";
import { requirePageUser } from "@/lib/server/auth";
import { loadTemplate } from "@/lib/server/activities";
import { Card, Notice, PageHeader, Stepper } from "@/components/ui";
import { NewActivityForm } from "./new-activity-form";

export const metadata = { title: "Create activity" };

const STEPS = ["Details", "Evidence", "Extraction", "Validation", "Review", "Generate", "Approve"];
const HINTS = ["You are here", "Upload documents", "Read in browser", "Counts & gaps", "Check every value", "Reports", "Faculty sign-off"];

export default async function NewActivityPage() {
  await requirePageUser();
  const sql = getSql();
  const templates = await sql<{ id: string; name: string; version: number }[]>`select id, name, version from templates where is_active order by name`;
  const loaded = await Promise.all(templates.map((t) => loadTemplate(sql, t.id)));
  return (
    <>
      <PageHeader
        eyebrow="New activity"
        title="Create activity"
        description="Enter what you know now — every field is optional here. Anything left blank can be extracted from uploaded documents in the next step or entered later. Nothing is filled in for you."
      />
      <Card className="mb-6 px-4 py-4 md:px-6">
        <Stepper steps={STEPS.map((label, i) => ({ label, state: i === 0 ? "current" : "todo", hint: HINTS[i] }))} />
      </Card>
      {loaded.length === 0 ? (
        <Notice tone="error" title="No active template">No active template is configured. Ask an administrator.</Notice>
      ) : (
        <NewActivityForm templates={loaded.map((t) => ({ id: t.id, name: `${t.name} (v${t.version})`, fields: t.def.fields }))} />
      )}
    </>
  );
}
