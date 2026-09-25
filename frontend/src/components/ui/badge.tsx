import { cn } from "./cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-subtle text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}
