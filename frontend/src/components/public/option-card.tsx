"use client";

import { Check } from "lucide-react";
import { RichHtml } from "@/components/rich-html";
import { cn } from "@/components/ui/cn";
import type { AttemptOption } from "@/lib/public-types";

/**
 * One answer choice: a native radio/checkbox (visually hidden, still focusable and announced)
 * inside a large tappable label. Selected state = accent border + filled marker with a check.
 */
export function OptionCard({
  itemId,
  option,
  letter,
  type,
  checked,
  onChange,
}: {
  itemId: string;
  option: AttemptOption;
  letter: string;
  type: "single" | "multiple";
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const hasImage = !!option.image_url;
  return (
    <label
      className={cn(
        "group relative flex min-h-14 cursor-pointer gap-3 rounded-2xl border-2 p-3 shadow-sm transition-[transform,border-color,background-color,box-shadow] duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent active:scale-[0.99] md:p-4",
        hasImage ? "flex-col" : "items-center",
        checked ? "border-accent bg-accent-soft shadow-md" : "border-border-soft bg-surface hover:-translate-y-px hover:border-faint hover:shadow-md",
      )}
    >
      <input
        type={type === "single" ? "radio" : "checkbox"}
        name={`q-${itemId}`}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={option.image_url!} alt="" className="aspect-[4/3] w-full rounded-xl bg-subtle object-contain" />
      )}
      <span className={cn("flex min-w-0 flex-1 items-center gap-3", hasImage && "w-full")}>
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center border-2 text-sm font-extrabold transition-colors",
            type === "single" ? "rounded-full" : "rounded-lg",
            checked ? "border-accent bg-accent text-accent-foreground" : "border-border bg-subtle text-muted group-hover:border-faint",
          )}
        >
          {checked ? <Check className="anim-pop size-5" strokeWidth={3.5} /> : letter}
        </span>
        <RichHtml html={option.text_html} className="min-w-0 flex-1 text-base md:text-lg" />
      </span>
    </label>
  );
}
