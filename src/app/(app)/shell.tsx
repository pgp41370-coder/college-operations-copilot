"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Bell,
  BookOpenCheck,
  ChevronsLeft,
  ChevronsRight,
  FileStack,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Plus,
  ScrollText,
  Search,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/components/client-api";
import {
  cx,
  Dot,
  fmtRelative,
  STATUS_LABELS,
  StatusBadge,
} from "@/components/ui";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/activities", label: "Activities", icon: ListChecks },
  { href: "/documents", label: "Documents", icon: FileStack },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/templates", label: "Templates", icon: BookOpenCheck },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface ShellProps {
  user: { name: string; email: string; role: string };
  notifications: {
    id: string;
    display_title: string | null;
    status: string;
    updated_at: string;
  }[];
  notificationTotal: number;
  system: { database: string; ai: string; env: string };
  children: ReactNode;
}

function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="focus-ring flex min-w-0 items-center gap-2.5 rounded-md"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-strong text-[12px] font-bold text-white shadow-sm">
        CO
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13.5px] font-semibold tracking-tight">
            College Operations Copilot
          </span>
          <span className="block truncate text-[11px] text-muted">
            Evidence-grounded institutional operations
          </span>
        </span>
      )}
    </Link>
  );
}

function useSignOut() {
  const router = useRouter();
  return async () => {
    await api("/api/auth/logout", { body: {} }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };
}

function NavList({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/activities"
      ? path === "/activities" ||
        (path.startsWith("/activities/") && path !== "/activities/new")
      : path === href || path.startsWith(`${href}/`);
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const on = active(n.href);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            title={collapsed ? n.label : undefined}
            aria-current={on ? "page" : undefined}
            className={cx(
              "focus-ring group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
              on
                ? "bg-brand-soft font-medium text-brand-strong"
                : "text-fg-2 hover:bg-surface-3 hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {on && (
              <span
                aria-hidden
                className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand"
              />
            )}
            <Icon
              className={cx(
                "h-4 w-4 shrink-0",
                on ? "text-brand" : "text-muted group-hover:text-fg-2",
              )}
              aria-hidden
            />
            {!collapsed && <span className="truncate">{n.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function SystemStatus({
  system,
  collapsed,
}: {
  system: ShellProps["system"];
  collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <div
        className="flex justify-center py-1"
        title={`Database ${system.database} · AI assistance ${system.ai === "llm" ? "on" : "off"}`}
      >
        <Dot tone={system.database === "connected" ? "success" : "danger"} />
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-2.5 text-[11.5px]">
      <div className="t-caption mb-1.5">System</div>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-fg-2">Database</span>
        <span className="flex items-center gap-1.5 text-success">
          <Dot tone="success" /> Connected
        </span>
      </div>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-fg-2">OCR</span>
        <span className="text-muted">In-browser</span>
      </div>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-fg-2">AI assistance</span>
        <span className={system.ai === "llm" ? "text-info" : "text-muted"}>
          {system.ai === "llm" ? "On (grounded)" : "Off"}
        </span>
      </div>
    </div>
  );
}

function Popover({
  button,
  children,
  align = "right",
  label,
}: {
  button: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "right" | "left";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring rounded-md"
      >
        {button(open)}
      </button>
      {open && (
        <div
          role="menu"
          className={cx(
            "anim-scale absolute top-full z-40 mt-1.5 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-md",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/* Sidebar preference lives in localStorage (per browser); read without effects. */
const SIDEBAR_KEY = "coc.sidebar";
const sidebarListeners = new Set<() => void>();
function subscribeSidebar(cb: () => void) {
  sidebarListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    sidebarListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readSidebar() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

export function AppShell({
  user,
  notifications,
  notificationTotal,
  system,
  children,
}: ShellProps) {
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    readSidebar,
    () => false,
  );
  // The drawer is open only on the path it was opened on, so navigating closes it.
  const [mobileOpenAt, setMobileOpenAt] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const router = useRouter();
  const signOut = useSignOut();
  const path = usePathname();

  const mobileOpen = mobileOpenAt === path;
  const setMobileOpen = (open: boolean) => setMobileOpenAt(open ? path : null);
  const toggle = () => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "open" : "collapsed");
    } catch {}
    sidebarListeners.forEach((l) => l());
  };
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sidebar = (compact: boolean, onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <div
        className={cx(
          "flex items-center",
          compact ? "justify-center" : "justify-between",
        )}
      >
        <Logo compact={compact} />
      </div>
      <Link
        href="/activities/new"
        onClick={onNavigate}
        title={compact ? "Create Activity" : undefined}
        className={cx("btn btn-primary w-full", compact && "px-0")}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {!compact && "Create Activity"}
      </Link>
      <NavList collapsed={compact} onNavigate={onNavigate} />
      <div className="mt-auto space-y-2">
        <SystemStatus system={system} collapsed={compact} />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      {/* The column spans the full page height; the inner panel stays in view. */}
      <aside
        className={cx(
          "no-print hidden shrink-0 border-r border-line bg-surface transition-[width] duration-200 lg:block",
          collapsed ? "w-[68px]" : "w-[248px]",
        )}
      >
        <div className="sticky top-0 h-screen">
          {sidebar(collapsed)}
          <button
            onClick={toggle}
            className="focus-ring absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-xs hover:text-foreground"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronsRight className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronsLeft className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </div>
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="anim-fade absolute inset-0 bg-brand-deep/30"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="anim-drawer-left absolute inset-y-0 left-0 w-[272px] bg-surface shadow-lg"
          >
            <button
              className="btn btn-ghost btn-sm absolute right-2 top-3"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            {sidebar(false, () => setMobileOpen(false))}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <button
              className="btn btn-ghost btn-sm lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
            <form
              role="search"
              className="relative w-full max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim())
                  router.push(`/search?q=${encodeURIComponent(q.trim())}`);
              }}
            >
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="input pl-8"
                placeholder="Search activities and documents…"
                aria-label="Search activities and documents"
              />
            </form>
            <div className="ml-auto flex items-center gap-2">
              <span
                className={cx(
                  "hidden items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium sm:flex",
                  system.env === "Production"
                    ? "border-success-line bg-success-soft text-success"
                    : "border-line bg-surface-2 text-fg-2",
                )}
                title="Deployment environment"
              >
                <Dot
                  tone={system.env === "Production" ? "success" : "neutral"}
                />{" "}
                {system.env}
              </span>
              <Popover
                label={`Notifications: ${notificationTotal} activities awaiting a person`}
                button={() => (
                  <span className="btn btn-ghost btn-sm relative">
                    <Bell className="h-4 w-4" aria-hidden />
                    {notificationTotal > 0 && (
                      <span className="t-num absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold text-white">
                        {notificationTotal}
                      </span>
                    )}
                  </span>
                )}
              >
                {(close) => (
                  <div>
                    <div className="border-b border-line px-3.5 py-2.5">
                      <p className="t-card">Awaiting a person</p>
                      <p className="t-meta">
                        Activities that need review or are ready for approval
                      </p>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="t-meta px-3.5 py-6 text-center">
                        Nothing is waiting on you.
                      </p>
                    ) : (
                      <ul className="max-h-80 overflow-auto py-1">
                        {notifications.map((n) => (
                          <li key={n.id}>
                            <Link
                              href={`/activities/${n.id}`}
                              onClick={close}
                              className="flex items-start justify-between gap-3 px-3.5 py-2 hover:bg-surface-2"
                              role="menuitem"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-medium">
                                  {n.display_title ?? "Untitled activity"}
                                </span>
                                <span className="t-meta">
                                  {STATUS_LABELS[n.status]} ·{" "}
                                  {fmtRelative(n.updated_at)}
                                </span>
                              </span>
                              <StatusBadge status={n.status} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Popover>
              <Popover
                label="Account menu"
                button={() => (
                  <span className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-deep text-[11px] font-semibold text-white">
                      {initials}
                    </span>
                    <span className="hidden text-left leading-tight md:block">
                      <span className="block max-w-36 truncate text-[12.5px] font-medium">
                        {user.name}
                      </span>
                      <span className="block text-[11px] capitalize text-muted">
                        {user.role}
                      </span>
                    </span>
                  </span>
                )}
              >
                {(close) => (
                  <div className="py-1">
                    <div className="border-b border-line px-3.5 py-2.5">
                      <p className="truncate text-[13px] font-medium">
                        {user.name}
                      </p>
                      <p className="t-meta truncate">{user.email}</p>
                    </div>
                    <Link
                      href="/settings"
                      onClick={close}
                      role="menuitem"
                      className="flex items-center gap-2 px-3.5 py-2 text-[13px] hover:bg-surface-2"
                    >
                      <Settings className="h-4 w-4 text-muted" aria-hidden />{" "}
                      Settings
                    </Link>
                    <button
                      role="menuitem"
                      onClick={signOut}
                      className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] hover:bg-surface-2"
                    >
                      <LogOut className="h-4 w-4 text-muted" aria-hidden /> Sign
                      out
                    </button>
                  </div>
                )}
              </Popover>
            </div>
          </div>
        </header>
        <div className="no-print border-b border-warning-line bg-warning-soft px-4 py-1 text-center text-[11.5px] text-warning md:px-6">
          Do not upload confidential or personally identifiable information
          unless your institution has authorized its use.
        </div>
        <main
          key={path}
          className="anim-page mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 md:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
