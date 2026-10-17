"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDialKit } from "dialkit";

type BackupSummary = {
  id: string;
  createdAt: string;
  files: { name: string; bytes: number }[];
  totalBytes: number;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function LibraryBackupsDialog({
  open,
  onOpenChange,
  busy,
  onCreateBackup,
  onRestoreBackup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onCreateBackup: () => Promise<void>;
  onRestoreBackup: (backupId: string) => Promise<unknown>;
}) {
  const spacing = useDialKit("Library Backups", {
    dialogPaddingX: [20, 0, 48, 1],
    dialogPaddingY: [20, 0, 48, 1],
    sectionGap: [14, 0, 32, 1],
    headerGap: [8, 0, 24, 1],
    itemPaddingX: [12, 0, 32, 1],
    itemPaddingY: [10, 0, 28, 1],
    buttonPaddingX: [12, 0, 32, 1],
    buttonPaddingY: [7, 0, 20, 1],
    buttonFontSize: [13, 11, 18, 1],
    buttonRadius: [10, 0, 20, 1],
    itemRadius: [12, 0, 24, 1],
    itemFontSize: [13, 11, 18, 1],
  });
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    const response = await apiFetch("/api/backup");
    if (!response.ok) throw new Error("Could not load backups.");
    const payload = await response.json();
    setBackups(Array.isArray(payload.backups) ? (payload.backups as BackupSummary[]) : []);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmId(null);
    loadBackups().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Could not load backups.")
    );
  }, [open, loadBackups]);

  const handleCreate = useCallback(async () => {
    try {
      await onCreateBackup();
      await loadBackups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Backup failed.");
    }
  }, [onCreateBackup, loadBackups]);

  const handleRestore = useCallback(
    async (backupId: string) => {
      if (confirmId !== backupId) {
        setConfirmId(backupId);
        return;
      }
      setConfirmId(null);
      try {
        await onRestoreBackup(backupId);
        onOpenChange(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Restore failed.");
      }
    },
    [confirmId, onRestoreBackup, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden ring-0 sm:max-w-none"
        style={{
          width: "min(34rem, calc(100vw - 2rem))",
          maxWidth: "calc(100vw - 2rem)",
          maxHeight: "calc(100dvh - 2rem)",
          boxSizing: "border-box",
          minWidth: 0,
          padding: `${spacing.dialogPaddingY}px ${spacing.dialogPaddingX}px`,
          gap: spacing.sectionGap,
        }}
      >
        <DialogHeader className="w-full min-w-0" style={{ gap: spacing.headerGap }}>
          <DialogTitle>Backup & restore</DialogTitle>
          <DialogDescription>
            Snapshots of your local library (bookmarks, folders, sync source). Restoring replaces the current data with the selected snapshot.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {backups.length > 0
              ? `${backups.length} snapshot${backups.length === 1 ? "" : "s"} · oldest pruned beyond 10`
              : "No snapshots yet"}
          </span>
          <button
            type="button"
            disabled={busy}
            className="font-medium text-foreground transition-colors disabled:opacity-50 disabled:cursor-progress"
            style={{
              padding: `${spacing.buttonPaddingY}px ${spacing.buttonPaddingX}px`,
              borderRadius: spacing.buttonRadius,
              fontSize: spacing.buttonFontSize,
              background: "var(--secondary)",
            }}
            onClick={handleCreate}
          >
            {busy ? "Backing up." : "Create backup"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {backups.map((backup) => (
            <div
              key={backup.id}
              className="flex w-full min-w-0 items-center justify-between gap-3"
              style={{
                padding: `${spacing.itemPaddingY}px ${spacing.itemPaddingX}px`,
                borderRadius: spacing.itemRadius,
                background: "var(--secondary)",
                boxSizing: "border-box",
              }}
            >
              <span className="min-w-0 truncate text-sm" style={{ fontSize: spacing.itemFontSize }}>
                {new Date(backup.createdAt).toLocaleString()}
                <span className="text-muted-foreground"> · {formatBytes(backup.totalBytes)}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                className="shrink-0 font-medium transition-colors disabled:opacity-50"
                style={{
                  padding: `${spacing.buttonPaddingY}px ${spacing.buttonPaddingX}px`,
                  borderRadius: spacing.buttonRadius,
                  fontSize: spacing.buttonFontSize,
                  background: confirmId === backup.id ? "var(--destructive)" : "transparent",
                  color: confirmId === backup.id ? "var(--destructive-foreground)" : "var(--foreground)",
                  border: "none",
                  cursor: busy ? "progress" : "pointer",
                }}
                onClick={() => {
                  void handleRestore(backup.id);
                }}
              >
                {confirmId === backup.id ? "Confirm restore" : "Restore"}
              </button>
            </div>
          ))}
          {backups.length === 0 && !error && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Create a snapshot before making changes you might want to undo.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
