import { cn } from "@/components/ui/cn";

/** Brand mark: a rounded tile with a check and a small spark. Purely geometric. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9 shrink-0", className)} aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="var(--accent)" />
      <path d="M11.5 21.5l5.6 5.6L28.5 14" fill="none" stroke="var(--accent-foreground)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="31" cy="9.5" r="3" fill="var(--t3-solid)" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-extrabold tracking-tight", className)}>
      <LogoMark />
      {!compact && <span className="text-lg leading-none">Bilim sinovi</span>}
    </span>
  );
}
