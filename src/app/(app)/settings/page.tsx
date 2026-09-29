import { getSql } from "@/lib/db";
import { aiStatus } from "@/lib/ai/provider";
import { requirePageUser } from "@/lib/server/auth";
import { listUsers } from "@/lib/server/users";
import { Badge, PageHeader, PRIVACY_NOTICE } from "@/components/ui";
import { PasswordForm, SignOut, UserAdmin } from "./settings-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  const users = user.role === "admin" ? await listUsers(getSql(), user) : [];
  const ai = aiStatus();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-semibold">Your account</h2>
          <p className="text-sm">{user.name} · {user.email} · <Badge>{user.role}</Badge></p>
          <PasswordForm />
          <SignOut />
        </section>
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="text-sm font-semibold">Extraction &amp; AI</h2>
          <p>Field extraction: <strong>deterministic rules</strong> over PDF text layers and in-browser OCR (Tesseract).</p>
          <p>Language model: {ai.mode === "llm" ? <Badge tone="violet">{ai.label}</Badge> : <Badge>Not configured</Badge>}</p>
          <p className="text-xs text-muted">Report text is assembled from reviewed fields by the template engine. No part of a report is written by an AI model. See SETUP.md to optionally enable an OpenAI-compatible model for grounded extraction suggestions.</p>
          <h2 className="pt-2 text-sm font-semibold">Privacy</h2>
          <p className="text-xs">{PRIVACY_NOTICE}</p>
          <p className="text-xs text-muted">Uploaded files are stored privately in the database and served only to the activity owner and administrators.</p>
        </section>
        {user.role === "admin" && (
          <section className="card p-4 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold">Users (administrator)</h2>
            <UserAdmin users={JSON.parse(JSON.stringify(users))} selfId={user.id} />
          </section>
        )}
      </div>
    </>
  );
}
