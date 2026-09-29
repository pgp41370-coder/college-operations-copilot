import { requirePageUser } from "@/lib/server/auth";
import { PRIVACY_NOTICE } from "@/components/ui";
import { Sidebar } from "./sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar user={{ name: user.name, email: user.email, role: user.role }} />
      <div className="min-w-0 flex-1">
        <div className="no-print border-b border-amber-200 bg-amber-50 px-6 py-1.5 text-xs text-amber-900">{PRIVACY_NOTICE}</div>
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
