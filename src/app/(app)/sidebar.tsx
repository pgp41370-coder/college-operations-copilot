"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/components/client-api";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/activities", label: "Activities" },
  { href: "/activities/new", label: "Create Activity" },
  { href: "/documents", label: "Documents" },
  { href: "/reports", label: "Reports" },
  { href: "/templates", label: "Templates" },
  { href: "/audit", label: "Audit Log" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar({ user }: { user: { name: string; email: string; role: string } }) {
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) =>
    href === "/activities" ? path === "/activities" || (path.startsWith("/activities/") && !path.startsWith("/activities/new")) : path === href || path.startsWith(`${href}/`);
  return (
    <aside className="no-print flex shrink-0 flex-col border-b border-line bg-white md:min-h-screen md:w-60 md:border-r md:border-b-0">
      <div className="flex items-center gap-2 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">CO</div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">College Operations</div>
          <div className="text-xs text-muted">Copilot · Pilot</div>
        </div>
      </div>
      <nav className="flex flex-row flex-wrap gap-1 px-3 pb-3 md:flex-col md:flex-nowrap">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-md px-3 py-1.5 text-sm ${active(n.href) ? "bg-brand/10 font-medium text-brand" : "text-foreground hover:bg-slate-100"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto hidden border-t border-line px-5 py-4 md:block">
        <div className="truncate text-sm font-medium">{user.name}</div>
        <div className="truncate text-xs text-muted">{user.email} · {user.role}</div>
        <button
          className="mt-3 text-xs text-muted underline hover:text-foreground"
          onClick={async () => {
            await api("/api/auth/logout", { body: {} }).catch(() => {});
            router.replace("/login");
            router.refresh();
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
