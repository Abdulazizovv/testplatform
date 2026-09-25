"use client";

import { Check } from "lucide-react";
import { useId, type ComponentProps, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

const control =
  "block w-full rounded-xl border-2 bg-surface px-3.5 text-base text-foreground shadow-sm transition-[border-color,box-shadow] duration-150 placeholder:text-faint hover:border-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 disabled:bg-subtle disabled:text-muted";

function controlClass(invalid: boolean, extra?: string) {
  return cn(control, invalid ? "border-danger" : "border-border", extra);
}

export function Input({ invalid, className, ...rest }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input className={controlClass(!!invalid, cn("min-h-11", className))} aria-invalid={invalid || undefined} {...rest} />;
}

export function Textarea({ invalid, className, ...rest }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea className={controlClass(!!invalid, cn("min-h-24 py-2.5", className))} aria-invalid={invalid || undefined} {...rest} />;
}

export function Select({ invalid, className, children, ...rest }: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select className={controlClass(!!invalid, cn("min-h-11 pr-8", className))} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
}

/** Label + control + hint/error, wired with ids. `children` receives the props to spread. */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-bold">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, invalid: !!error })}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn("group flex min-h-11 cursor-pointer items-center gap-3 text-base md:min-h-9", className)}>
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          className="peer size-6 cursor-pointer appearance-none rounded-lg border-2 border-border bg-surface transition-colors checked:border-accent checked:bg-accent group-hover:border-faint"
          {...rest}
        />
        <Check className="pointer-events-none absolute size-4 text-accent-foreground opacity-0 peer-checked:opacity-100" strokeWidth={3.5} aria-hidden="true" />
      </span>
      <span>{label}</span>
    </label>
  );
}
