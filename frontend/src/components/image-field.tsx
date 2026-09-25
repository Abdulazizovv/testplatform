"use client";

import { useId, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import type { MediaAsset } from "@/lib/types";
import { Button, Spinner } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

export interface MediaRef {
  id: string;
  url: string;
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Client-side pre-check (the server re-checks by magic bytes). Returns an Uzbek message or null. */
export function checkImageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "Faqat JPEG, PNG yoki WebP rasm yuklash mumkin.";
  if (file.size > MAX_IMAGE_BYTES) return "Rasm hajmi 5 MB dan oshmasligi kerak.";
  return null;
}

export function firstImage(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  return Array.from(files).find((f) => f.type.startsWith("image/")) ?? null;
}

interface ImageFieldProps {
  label: string;
  value: MediaRef | null;
  onChange: (value: MediaRef | null) => void;
  upload: (file: File) => Promise<MediaAsset>;
  error?: string;
  /** Smaller layout for option rows. */
  compact?: boolean;
}

export function ImageField({ label, value, onChange, upload, error, compact }: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handle(file: File | null) {
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      const asset = await upload(file);
      onChange({ id: asset.id, url: asset.url });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Rasmni yuklab bo'lmadi.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void handle(firstImage(e.dataTransfer.files));
  }

  function onPaste(e: ClipboardEvent) {
    const file = firstImage(e.clipboardData.files);
    if (file) {
      e.preventDefault();
      void handle(file);
    }
  }

  const shownError = error ?? localError;

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.url} alt="" className={cn("rounded-md object-contain bg-subtle", compact ? "size-16" : "h-28 max-w-[50%]")} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={busy}>
              Almashtirish
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onChange(null)} disabled={busy}>
              Olib tashlash
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="group"
          aria-label={label}
          aria-describedby={hintId}
          tabIndex={0}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          onPaste={onPaste}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-center",
            compact ? "py-3" : "py-5",
            over ? "border-accent bg-accent-soft" : "border-border bg-surface",
          )}
        >
          {busy ? (
            <span className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Yuklanmoqda...
            </span>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                Rasm tanlash
              </Button>
              <p id={hintId} className="text-xs text-muted">
                yoki shu yerga tashlang / joylashtiring (Ctrl+V). JPEG, PNG, WebP, 5 MB gacha.
              </p>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void handle(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {shownError && (
        <p role="alert" className="text-sm text-danger">
          {shownError}
        </p>
      )}
    </div>
  );
}
