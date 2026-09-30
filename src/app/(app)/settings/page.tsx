import Link from "next/link";
import { ArrowRight, Bot, Database, KeyRound, LayoutTemplate, ShieldCheck, UserRound, Users } from "lucide-react";
import { getSql } from "@/lib/db";
import { aiStatus } from "@/lib/ai/provider";
import { requirePageUser } from "@/lib/server/auth";
import { schemaStatus } from "@/lib/server/schema-status";
import { listTemplates } from "@/lib/server/templates";
import { listUsers } from "@/lib/server/users";
import { Badge, Card, CardHeader, Dot, PageHeader, PRIVACY_NOTICE } from "@/components/ui";
import { PasswordForm, SignOut, UserAdmin } from "./settings-forms";

export const metadata = { title: "Settings" };

const SECTIONS = [
  ["account", "Account"],
  ["security", "Security"],
  ["templates", "Templates"],
  ["ai", "AI configuration"],
  ["system", "System"],
  ["privacy", "Data & privacy"],
] as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requirePageUser();
  const sql = getSql();
  const [users, schema, templates] = await Promise.all([user.role === "admin" ? listUsers(sql, user) : Promise.resolve([]), schemaStatus(sql), listTemplates(sql)]);
  const ai = aiStatus();
  const env = process.env.VERCEL_ENV === "production" ? "Production" : process.env.VERCEL_ENV === "preview" ? "Preview" : "Local";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const active = templates.filter((t) => t.is_active);
  return (
    <>
      <PageHeader title="Settings" description="Your account, security and how the system is configured. Values shown here are read from the running deployment." />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="scroll-thin flex gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="focus-ring block whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] text-fg-2 hover:bg-surface-3 hover:text-foreground">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          <Card id="account" className="scroll-mt-20">
            <CardHeader icon={UserRound} title="Account" />
            <dl className="divide-y divide-line">
              <Row label="Name">{user.name}</Row>
              <Row label="Email">{user.email}</Row>
              <Row label="Role"><Badge tone={user.role === "admin" ? "brand" : "neutral"}>{user.role === "admin" ? "Administrator" : "Faculty"}</Badge></Row>
            </dl>
            <div className="border-t border-line px-4 py-3">
              <SignOut />
            </div>
          </Card>

          <Card id="security" className="scroll-mt-20">
            <CardHeader icon={KeyRound} title="Security" description="Sign-in sessions last up to 7 days. Passwords are stored only as bcrypt hashes." />
            <div className="max-w-md p-4">
              <PasswordForm />
            </div>
          </Card>

          {user.role === "admin" && (
            <Card className="scroll-mt-20">
              <CardHeader icon={Users} title="Users" description="Administrator only. Accounts are created here; there is no public sign-up." />
              <div className="p-4">
                <UserAdmin users={JSON.parse(JSON.stringify(users))} selfId={user.id} />
              </div>
            </Card>
          )}

          <Card id="templates" className="scroll-mt-20">
            <CardHeader icon={LayoutTemplate} title="Templates" actions={<Link href="/templates" className="btn btn-ghost btn-sm">Manage <ArrowRight className="h-3 w-3" aria-hidden /></Link>} />
            <dl className="divide-y divide-line">
              {active.map((t) => (
                <Row key={t.id} label={t.name}>
                  v{t.version} · {t.activity_count} activit{t.activity_count === 1 ? "y" : "ies"}
                </Row>
              ))}
              {active.length === 0 && <Row label="Active templates">None</Row>}
            </dl>
          </Card>

          <Card id="ai" className="scroll-mt-20">
            <CardHeader icon={Bot} title="AI configuration" />
            <dl className="divide-y divide-line">
              <Row label="Language model">
                {ai.mode === "llm" ? <Badge tone="info">On · {ai.label}</Badge> : <Badge tone="neutral" dot>Off — not configured</Badge>}
              </Row>
              <Row label="Field extraction">Deterministic rules over PDF text and in-browser OCR</Row>
              <Row label="OCR engine">Tesseract (runs in the browser)</Row>
              <Row label="Report writing">Template engine — no AI-written text</Row>
              <Row label="Approval">Human only — never automatic</Row>
            </dl>
            <p className="t-meta border-t border-line px-4 py-3">
              {ai.mode === "llm"
                ? "LLM suggestions are accepted only when they quote the source text verbatim; they are then reviewed like any other value."
                : "No language model is connected. See SETUP.md to optionally enable an OpenAI-compatible model for grounded extraction suggestions."}
            </p>
          </Card>

          <Card id="system" className="scroll-mt-20">
            <CardHeader icon={Database} title="System" />
            <dl className="divide-y divide-line">
              <Row label="Environment">{env}{commit ? ` · ${commit}` : ""}</Row>
              <Row label="Database"><span className="inline-flex items-center gap-1.5"><Dot tone="success" /> Connected</span></Row>
              <Row label="Schema">
                <Badge tone={schema.migrations === "current" ? "success" : "warning"}>{schema.migrations === "current" ? "Current" : schema.migrations}</Badge>{" "}
                <span className="t-meta">{schema.tablesPresent}/{schema.tablesExpected} tables · {schema.latestApplied ?? "none"}</span>
              </Row>
              <Row label="Templates seeded">{schema.templatesSeeded}</Row>
            </dl>
          </Card>

          <Card id="privacy" className="scroll-mt-20">
            <CardHeader icon={ShieldCheck} title="Data & privacy" />
            <div className="space-y-2 p-4 text-[13px]">
              <p className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-warning">{PRIVACY_NOTICE}</p>
              <p className="text-fg-2">Uploaded files are stored privately in the database and served only to the activity owner and administrators. Originals are never modified; each file keeps its SHA-256 fingerprint.</p>
              <p className="text-fg-2">Text is extracted in your browser. Documents are not sent to an external OCR or AI service{ai.mode === "llm" ? " except the extracted text, when you run LLM-assisted extraction" : ""}.</p>
              <p className="text-fg-2">Every change is recorded in the append-only audit log.</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
