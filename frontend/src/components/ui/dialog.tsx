"use client";

// Modal built on the native <dialog>: focus trap, Esc, inert background and aria-modal come
// from the browser. Content is mounted only while open, so forms start fresh every time.
// On phones it docks to the bottom as a sheet; from sm up it is a centered card.
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";

interface DialogProps {
  open: boolean;
  /** Called on Esc, backdrop click and the close button. The parent decides whether to close. */
  onClose: () => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  footer?: ReactNode;
}

const widths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-3xl" };

export function Dialog({ open, onClose, title, description, size = "md", children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "mx-auto mb-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-border-soft bg-surface p-0 shadow-lg sm:m-auto sm:w-[calc(100%-1.5rem)] sm:rounded-3xl",
        widths[size],
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
            <div className="min-w-0 space-y-1">
              <h2 id={titleId} className="text-xl font-extrabold tracking-tight">
                {title}
              </h2>
              {description && <p className="text-sm text-muted">{description}</p>}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Yopish" className="-mr-2 -mt-1">
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>
          <div className="overflow-y-auto px-5 pb-5 pt-2">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border-soft bg-subtle/50 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
