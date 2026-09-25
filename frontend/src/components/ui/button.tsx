import type { ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger";
type Size = "md" | "sm" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground shadow-sm hover:bg-accent-hover",
  secondary: "border border-border bg-surface text-foreground shadow-sm hover:bg-subtle hover:border-faint",
  soft: "bg-accent-soft text-accent hover:brightness-95",
  ghost: "text-foreground hover:bg-subtle",
  danger: "bg-danger text-surface shadow-sm hover:brightness-110",
};
const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 text-base",
  sm: "min-h-11 px-3.5 text-sm md:min-h-9",
  lg: "min-h-14 px-4 text-base sm:px-6 sm:text-lg",
  icon: "size-11 md:size-9",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-xl font-bold transition-[background-color,box-shadow,transform,filter] duration-150 active:translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    extra,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant, size, loading, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant,
  size,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
