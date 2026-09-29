"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * SYSTEM-DESIGN.md §11.4: "Destructive or expensive actions ask first,
 * with a dialog stating the consequence." Built on Base UI's AlertDialog
 * (not the plain Dialog), the variant that requires an explicit choice
 * rather than being dismissible by an outside click - traps and restores
 * focus on close (§11.10).
 */
export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-black/40" />
        <AlertDialog.Popup
          className={cn("fixed left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border p-6 shadow-lg", "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]")}
        >
          <AlertDialog.Title className="text-base font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--color-text-muted)]">{description}</AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)]">
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              autoFocus
              className={cn("rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium", destructive ? "bg-[var(--color-danger-text)] text-white hover:opacity-90" : "bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:opacity-90")}
            >
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
