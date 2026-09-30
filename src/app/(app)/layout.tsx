import { getSql } from "@/lib/db";
import { aiStatus } from "@/lib/ai/provider";
import { requirePageUser } from "@/lib/server/auth";
import { ToastProvider } from "@/components/ui";
import { AppShell } from "./shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const sql = getSql();
  // Real data only: activities waiting on a person, visible to this user.
  const pending = await sql<{ id: string; display_title: string | null; status: string; updated_at: Date }[]>`
    select id, display_title, status, updated_at from activities
    where status in ('REVIEW_REQUIRED', 'READY_FOR_APPROVAL') and (${user.role === "admin"} or owner_id = ${user.id})
    order by updated_at desc limit 8`;
  const [{ n: pendingTotal }] = await sql<{ n: number }[]>`
    select count(*)::int as n from activities
    where status in ('REVIEW_REQUIRED', 'READY_FOR_APPROVAL') and (${user.role === "admin"} or owner_id = ${user.id})`;
  const env = process.env.VERCEL_ENV === "production" ? "Production" : process.env.VERCEL_ENV === "preview" ? "Preview" : "Local";
  return (
    <ToastProvider>
      <AppShell
        user={{ name: user.name, email: user.email, role: user.role }}
        notifications={JSON.parse(JSON.stringify(pending))}
        notificationTotal={pendingTotal}
        system={{ database: "connected", ai: aiStatus().mode, env }}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
