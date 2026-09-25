"use client";

import { useId, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { renderPreview } from "@/lib/rich";
import type { BodyFormat, MediaAsset } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Textarea } from "@/components/ui/field";
import { checkImageFile, firstImage } from "./image-field";

interface RichFieldProps {
  label: string;
  format: BodyFormat;
  value: string;
  onChange: (value: string) => void;
  upload: (file: File) => Promise<MediaAsset>;
  error?: string;
  rows?: number;
  placeholder?: string;
  /** Compact layout for option rows: smaller box, preview only when the text has markup. */
  compact?: boolean;
  /** Allow inserting images into the text (toolbar + paste + drop). */
  images?: boolean;
  hint?: string;
}

const MARKUP = /[*_`#>\[\]<|\\~]|\d\.\s/;

function imageSnippet(format: BodyFormat, url: string) {
  return format === "html" ? `<img src="${url}" alt="">` : `![](${url})`;
}

/** Source textarea + live sanitized preview (same allow-list as the server). */
export function RichField({ label, format, value, onChange, upload, error, rows = 5, placeholder, compact, images = true, hint }: RichFieldProps) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const html = useMemo(() => renderPreview(format, value), [format, value]);
  const showPreview = compact ? format === "html" || MARKUP.test(value) : true;

  async function insertImage(file: File) {
    const problem = checkImageFile(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setBusy(true);
    setUploadError(null);
    try {
      const asset = await upload(file);
      const el = ref.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      const snippet = imageSnippet(format, asset.url);
      const before = value.slice(0, start);
      const sep = before && !before.endsWith("\n") ? "\n" : "";
      onChange(`${before}${sep}${snippet}\n${value.slice(end)}`);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Rasmni yuklab bo'lmadi.");
    } finally {
      setBusy(false);
    }
  }

  function onPaste(e: ClipboardEvent) {
    if (!images) return;
    const file = firstImage(e.clipboardData.files);
    if (file) {
      e.preventDefault();
      void insertImage(file);
    }
  }

  function onDrop(e: DragEvent) {
    setOver(false);
    if (!images) return;
    const file = firstImage(e.dataTransfer.files);
    if (file) {
      e.preventDefault();
      void insertImage(file);
    }
  }

  const shownError = error ?? uploadError;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {images && !compact && (
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} loading={busy}>
            Rasm qo&apos;shish
          </Button>
        )}
      </div>
      <Textarea
        id={id}
        ref={ref}
        rows={rows}
        value={value}
        invalid={!!shownError}
        placeholder={placeholder}
        spellCheck={format === "md"}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        onDragOver={(e) => {
          if (images) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn("font-mono text-sm leading-relaxed md:text-sm", compact && "min-h-16", over && "border-accent bg-accent-soft")}
        aria-describedby={shownError ? `${id}-err` : undefined}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void insertImage(f);
          e.target.value = "";
        }}
      />
      {shownError ? (
        <p id={`${id}-err`} role="alert" className="text-sm text-danger">
          {shownError}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
      {showPreview && html && (
        <div className="rounded-lg border border-border-soft bg-subtle/60 px-3 py-2">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Ko&apos;rinishi</p>
          <div className="rich text-base" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}
