"use client";

import { useSyncExternalStore } from "react";
import { sanitizeHtml } from "@/lib/rich";
import { cn } from "@/components/ui/cn";

const subscribe = () => () => {};

/**
 * Renders HTML that the server already sanitized (nh3), passing it through DOMPurify again
 * in the browser. Never feed it unsanitized input. Renders nothing during SSR.
 */
export function RichHtml({ html, className }: { html: string; className?: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted || !html) return null;
  return <div className={cn("rich", className)} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
