"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/components/ui/cn";

/** Flips light/dark, remembers the choice. Icons swap via CSS, so there is no hydration state. */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme") ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("tp:theme", next);
    } catch {
      /* storage blocked: the choice just lasts for this page view */
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Yorug' va qorong'i temani almashtirish"
      title="Tema"
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-subtle hover:text-foreground active:scale-95 md:size-10",
        className,
      )}
    >
      <Moon className="only-light size-5" aria-hidden="true" />
      <Sun className="only-dark size-5" aria-hidden="true" />
    </button>
  );
}
