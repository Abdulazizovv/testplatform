import { AlertCircle, AlertTriangle, CheckCircle2, Info, Inbox, WifiOff } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";

/** Skeleton block; size it with classes. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

/** Skeleton stand-in for a list of row-cards. */
export function Loading({ label = "Yuklanmoqda...", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-border-soft bg-surface p-4">
          <Skeleton className="size-11 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <WifiOff className="size-7" aria-hidden="true" />
      </span>
      <p className="max-w-md text-base font-semibold text-danger">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Qayta urinish
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface/60 px-4 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        {icon ?? <Inbox className="size-7" aria-hidden="true" />}
      </span>
      <p className="text-lg font-extrabold">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function Notice({
  tone = "danger",
  children,
  className,
}: {
  tone?: "danger" | "warning" | "success" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    danger: "border-danger-line bg-danger-soft text-danger",
    warning: "border-warning-line bg-warning-soft text-warning",
    success: "border-success-line bg-success-soft text-success",
    info: "border-info-line bg-accent-soft text-accent",
  };
  const Icon = { danger: AlertCircle, warning: AlertTriangle, success: CheckCircle2, info: Info }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm font-semibold", tones[tone], className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="text-base text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
