"use client";
/** Interactive UI primitives (client components). */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertOctagon, CheckCircle2, Info, UploadCloud, X, type LucideIcon } from "lucide-react";
import { cx } from "./primitives";

/* -------------------------------------------------------------------- tabs */
export interface TabItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
  countTone?: "warning" | "danger" | "neutral";
}
export function Tabs({ items, active, onChange, ariaLabel }: { items: TabItem[]; active: string; onChange: (k: string) => void; ariaLabel: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next == null) return;
    e.preventDefault();
    const n = (next + items.length) % items.length;
    refs.current[n]?.focus();
    onChange(items[n].key);
  };
  return (
    <div role="tablist" aria-label={ariaLabel} className="scroll-thin -mb-px flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t, i) => {
        const selected = t.key === active;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(t.key)}
            className={cx(
              "focus-ring relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-[13px] transition-colors",
              selected ? "font-medium text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
            {t.label}
            {t.count != null && t.count > 0 && (
              <span
                className={cx(
                  "t-num rounded px-1 text-[10.5px] font-semibold",
                  t.countTone === "danger" ? "bg-danger-soft text-danger" : t.countTone === "warning" ? "bg-warning-soft text-warning" : "bg-surface-3 text-fg-2",
                )}
              >
                {t.count}
              </span>
            )}
            <span aria-hidden className={cx("absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors", selected ? "bg-brand" : "bg-transparent")} />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------ segmented control */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "focus-ring flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] transition-colors",
            value === o.value ? "bg-surface font-medium text-foreground shadow-xs ring-1 ring-line" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
          {o.count != null && <span className="t-num text-[11px] text-muted">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- modal / drawer */
function useDialog(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus], button, a, input, select, textarea")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, iframe, [tabindex]:not([tabindex='-1'])")];
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  return panel;
}

export function Drawer({ open, onClose, title, side = "right", width = "max-w-5xl", children }: { open: boolean; onClose: () => void; title: ReactNode; side?: "right" | "left"; width?: string; children: ReactNode }) {
  const panel = useDialog(open, onClose);
  const id = useId();
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="anim-fade absolute inset-0 bg-brand-deep/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={cx(
          "absolute top-0 flex h-full w-full flex-col bg-surface shadow-lg",
          width,
          side === "right" ? "right-0 anim-drawer-right border-l border-line" : "left-0 anim-drawer-left border-r border-line",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={id} className="t-section min-w-0 truncate">
            {title}
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const panel = useDialog(open, onClose);
  const id = useId();
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="anim-fade absolute inset-0 bg-brand-deep/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={id} className="anim-scale relative w-full max-w-lg rounded-xl border border-line bg-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id={id} className="t-section">
            {title}
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ toasts */
type ToastTone = "success" | "error" | "info";
interface ToastMsg {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}
const ToastCtx = createContext<(t: Omit<ToastMsg, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((t: Omit<ToastMsg, "id">) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), t.tone === "error" ? 8000 : 4500);
  }, []);
  const icon = { success: CheckCircle2, error: AlertOctagon, info: Info };
  const tone = { success: "text-success", error: "text-danger", info: "text-info" };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" role="status">
        {items.map((t) => {
          const Icon = icon[t.tone];
          return (
            <div key={t.id} className="anim-scale pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 shadow-md">
              <Icon className={cx("mt-0.5 h-4 w-4 shrink-0", tone[t.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{t.title}</p>
                {t.body && <p className="t-meta mt-0.5 break-words">{t.body}</p>}
              </div>
              <button className="text-subtle hover:text-foreground" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} aria-label="Dismiss">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------------- dropzone */
export function FileDropzone({ onFiles, accept, disabled, hint, maxLabel, inputLabel }: { onFiles: (f: FileList | File[]) => void; accept: string; disabled?: boolean; hint?: ReactNode; maxLabel: string; inputLabel: string }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(e.dataTransfer.files);
      }}
      className={cx(
        "group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors",
        over ? "border-brand bg-brand-soft" : "border-line-strong bg-surface-2 hover:border-brand-line hover:bg-brand-soft/40",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <span className={cx("flex h-11 w-11 items-center justify-center rounded-full ring-1 transition-colors", over ? "bg-brand text-white ring-brand" : "bg-surface text-brand ring-brand-line")}>
        <UploadCloud className="h-5 w-5" aria-hidden />
      </span>
      <p className="t-card mt-3">Upload evidence</p>
      <p className="t-meta mt-0.5">
        Drag &amp; drop files here, or{" "}
        <button type="button" className="focus-ring font-medium text-brand underline-offset-2 hover:underline" onClick={() => input.current?.click()}>
          browse files
        </button>
      </p>
      <div className="mt-3 flex items-center gap-1.5">
        {["PDF", "JPG", "PNG"].map((t) => (
          <span key={t} className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-fg-2">
            {t}
          </span>
        ))}
        <span className="t-meta ml-1">Maximum file size: {maxLabel}</span>
      </div>
      {hint && <div className="t-meta mt-2">{hint}</div>}
      <input ref={input} type="file" multiple accept={accept} aria-label={inputLabel} className="hidden" onChange={(e) => e.target.files && onFiles(e.target.files)} />
    </div>
  );
}
