"use client";

import { useRef, useSyncExternalStore } from "react";
import { sanitizeHtml } from "@/lib/rich";
import { useMath } from "@/lib/math";
import { cn } from "@/components/ui/cn";

const subscribe = () => () => {};

/**
 * Renders HTML that the server already sanitized (nh3), passing it through DOMPurify again
 * in the browser, then typesets math with KaTeX. Never feed it unsanitized input. Renders
 * nothing during SSR.
 */
export function RichHtml({ html, className }: { html: string; className?: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const ref = useRef<HTMLDivElement>(null);
  useMath(ref);
  if (!mounted || !html) return null;
  return <div ref={ref} className={cn("rich", className)} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
