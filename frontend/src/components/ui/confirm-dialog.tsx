"use client";

import { useState } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Notice } from "./states";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  /** Throw to keep the dialog open and show the error inside it. */
  onConfirm: () => Promise<void>;
}

export function ConfirmDialog({ open, onClose, title, message, confirmLabel, danger, onConfirm }: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik yuz berdi.");
    } finally {
      setPending(false);
    }
  }

  function close() {
    if (pending) return;
    setError(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Bekor qilish
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={confirm} loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-base text-muted">{message}</p>
        {error && <Notice>{error}</Notice>}
      </div>
    </Dialog>
  );
}
