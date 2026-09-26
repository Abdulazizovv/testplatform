"use client";

// Renders `.math-inline[data-tex]` / `.math-block[data-tex]` elements (produced by the server's
// render_rich and by lib/rich.ts previews) with KaTeX. The TeX source only ever enters KaTeX
// as a string, never as HTML. On any failure the raw source stays visible.
import { useEffect, type RefObject } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export function renderMath(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".math-inline[data-tex], .math-block[data-tex]").forEach((el) => {
    const tex = el.dataset.tex ?? "";
    try {
      katex.render(tex, el, {
        displayMode: el.classList.contains("math-block"),
        throwOnError: false,
        trust: false,
        strict: "ignore",
        maxExpand: 1000,
      });
    } catch {
      el.textContent = tex;
      el.classList.add("math-error");
    }
  });
}

// Runs after every render (the target may mount later than its html, e.g. preview toggles).
export function useMath(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (ref.current) renderMath(ref.current);
  });
}
