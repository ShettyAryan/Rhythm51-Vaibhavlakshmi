"use client";

import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";

// ---------------------------------------------------------------------------
// Buttons & form controls
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-plum text-ivory hover:bg-wine border border-plum",
  secondary: "border border-plum/30 bg-white text-plum hover:border-plum hover:bg-plum/5",
  ghost: "text-plum hover:bg-plum/8 border border-transparent",
  danger: "border border-red-700/40 bg-white text-red-800 hover:bg-red-50",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm"
      } ${VARIANT[variant]} ${className}`}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className = "" }: { label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-charcoal/70">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-stone">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

const inputCls =
  "block w-full border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal outline-none transition placeholder:text-stone/70 focus:border-plum focus:ring-2 focus:ring-plum/15 disabled:bg-sand/40";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      className={`${inputCls} tabular-nums ${rest.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} min-h-24 ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} pr-8 ${props.className ?? ""}`} />;
}

export function Toggle({ checked, onChange, label, description, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-plum" : "bg-charcoal/25"}`}
      >
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${checked ? "left-[1.125rem]" : "left-0.5"}`} />
      </button>
      <span>
        <span className="block text-sm text-charcoal">{label}</span>
        {description && <span className="block text-xs text-stone">{description}</span>}
      </span>
    </label>
  );
}

export function StatusBadge({ status }: { status: "draft" | "published" }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
        status === "published" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-700/20" : "bg-amber-50 text-amber-800 ring-1 ring-amber-700/25"
      }`}
    >
      {status}
    </span>
  );
}

export function StatusSelect({ value, onChange, testId }: { value: "draft" | "published"; onChange: (v: "draft" | "published") => void; testId?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as "draft" | "published")} data-testid={testId} className="!w-40">
      <option value="draft">Draft (hidden)</option>
      <option value="published">Published</option>
    </Select>
  );
}

export function Panel({ title, actions, children, className = "", description }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; description?: React.ReactNode }) {
  return (
    <section className={`border border-charcoal/10 bg-white ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-charcoal/10 px-5 py-3">
          <div>
            {title && <h2 className="font-display text-xl text-plum">{title}</h2>}
            {description && <p className="text-xs text-stone">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl text-plum sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-stone">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  kind: "success" | "error";
  message: string;
}
const ToastCtx = createContext<{ success: (m: string) => void; error: (m: unknown) => void }>({ success: () => {}, error: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 3500);
  }, []);
  const value = useRef({
    success: (m: string) => push("success", m),
    error: (m: unknown) => push("error", m instanceof Error ? m.message : String(m)),
  }).current;
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            data-testid={`toast-${t.kind}`}
            className={`pointer-events-auto flex items-start gap-3 border bg-white px-4 py-3 text-sm shadow-lg ${t.kind === "error" ? "border-red-700/30 text-red-900" : "border-emerald-700/25 text-emerald-900"}`}
          >
            {t.kind === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button type="button" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss">
              <X className="size-4 opacity-60" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------------------
// Confirmation dialog
// ---------------------------------------------------------------------------

export function useConfirm() {
  const [state, setState] = useState<{ title: string; message: React.ReactNode; confirmLabel: string; resolve: (ok: boolean) => void } | null>(null);
  const confirm = useCallback(
    (title: string, message: React.ReactNode, confirmLabel = "Delete") =>
      new Promise<boolean>((resolve) => setState({ title, message, confirmLabel, resolve })),
    [],
  );
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const element = (
    <Dialog open={!!state} onClose={() => close(false)} title={state?.title ?? "Confirm"} className="w-[min(92vw,460px)]">
      <div className="px-5 py-4 text-sm text-charcoal/85">{state?.message}</div>
      <div className="flex justify-end gap-2 border-t border-charcoal/10 px-5 py-3">
        <Button onClick={() => close(false)}>Cancel</Button>
        <Button variant="danger" onClick={() => close(true)} data-testid="confirm-ok">
          {state?.confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
  return { confirm, element };
}
