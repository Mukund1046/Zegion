"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/client-api";
import type { Bookmark } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDialKit } from "dialkit";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon, ChevronDownIcon } from "@hugeicons/core-free-icons";

type ReviewResult = {
  id: string;
  label: string | null;
  outcome: "suggestion" | "abstained" | "failed" | string;
  status: string;
  errorCode?: string | null;
  provider?: string;
  reviewStatus?: "pending" | "applied" | "dismissed" | null;
};

type ReviewRun = {
  runId: string;
  provider: string;
  engine?: string;
  startedAt?: string;
  telemetry?: {
    classified?: number;
    abstained?: number;
    failures?: number;
    categoriesClassified?: number;
    domainsClassified?: number;
  };
  results: ReviewResult[];
};

export function ClassificationReviewDialog({
  open,
  onOpenChange,
  bookmarks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarks: Bookmark[];
}) {
  const spacing = useDialKit("Classification Review", {
    dialogPaddingX: [20, 0, 48, 1],
    dialogPaddingY: [20, 0, 48, 1],
    sectionGap: [16, 0, 32, 1],
    headerPaddingX: [0, 0, 32, 1],
    headerPaddingY: [0, 0, 32, 1],
    headerGap: [8, 0, 24, 1],
    runSelectorPaddingX: [8, 0, 32, 1],
    runSelectorPaddingY: [8, 0, 24, 1],
    listPaddingX: [0, 0, 32, 1],
    listPaddingY: [0, 0, 32, 1],
    itemPaddingX: [12, 0, 32, 1],
    itemPaddingY: [12, 0, 32, 1],
    itemGap: [12, 0, 28, 1],
    itemContentGap: [4, 0, 20, 1],
    messagePaddingX: [16, 0, 40, 1],
    messagePaddingY: [16, 0, 40, 1],
    dropdownHeight: [36, 28, 48, 1],
    dropdownRadius: [8, 0, 24, 1],
    dropdownFontSize: [12, 10, 18, 1],
    dropdownPaddingX: [12, 4, 32, 1],
    dropdownMenuRadius: [12, 0, 24, 1],
    dropdownMenuPadding: [4, 0, 16, 1],
    dropdownItemRadius: [8, 0, 16, 1],
    dropdownItemPaddingX: [8, 0, 24, 1],
    dropdownItemPaddingY: [6, 0, 16, 1],
    dropdownItemGap: [8, 0, 24, 1],
    dropdownItemFontSize: [13, 11, 20, 1],
    dropdownBg: { type: "color", default: "light-dark(#fafafa, #1a1a1a)" },
    dropdownFocusBg: { type: "color", default: "light-dark(#ececec, #262626)" },
    dropdownMenuBg: { type: "color", default: "var(--popover)" },
    dropdownHoverBg: { type: "color", default: "light-dark(#f6f6f6, #2a2a2a)" },
  });
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [runId, setRunId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const [runMenuPosition, setRunMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const runTriggerRef = useRef<HTMLButtonElement>(null);

  const loadRuns = useCallback(async () => {
    const response = await apiFetch("/api/classify/runs");
    if (!response.ok) throw new Error("Could not load classification history.");
    const payload = await response.json();
    const next = Array.isArray(payload.runs) ? payload.runs as ReviewRun[] : [];
    setRuns(next);
    setRunId((current) => next.some((run) => run.runId === current) ? current : next[0]?.runId || "");
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    loadRuns().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load classification history."));
  }, [open, loadRuns]);

  const run = runs.find((item) => item.runId === runId);
  const runLabel = (item: ReviewRun) => {
    const summary = item.telemetry?.categoriesClassified !== undefined
      ? `${item.telemetry.categoriesClassified} categories · ${item.telemetry.domainsClassified || 0} domains`
      : `${item.telemetry?.classified || 0} labels · ${item.telemetry?.failures || 0} failures`;
    return `${item.provider}${item.engine ? ` (${item.engine})` : ""} · ${new Date(item.startedAt || 0).toLocaleString()} · ${summary}`;
  };
  const bookmarkById = useMemo(() => new Map(bookmarks.map((bookmark) => [String(bookmark.id), bookmark])), [bookmarks]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden ring-0 sm:max-w-none"
        style={{
          width: "min(42rem, calc(100vw - 2rem))",
          maxWidth: "calc(100vw - 2rem)",
          maxHeight: "calc(100dvh - 2rem)",
          boxSizing: "border-box",
          minWidth: 0,
          padding: `${spacing.dialogPaddingY}px ${spacing.dialogPaddingX}px`,
          gap: spacing.sectionGap,
        }}
      >
        <DialogHeader className="w-full min-w-0" style={{ boxSizing: "border-box", padding: `${spacing.headerPaddingY}px ${spacing.headerPaddingX}px`, gap: spacing.headerGap }}>
          <DialogTitle>Classification history</DialogTitle>
          <DialogDescription>
            Older staged suggestions are shown for reference only. New classifications run through Field Theory and are committed directly to its database.
          </DialogDescription>
        </DialogHeader>

        {runs.length > 0 && (
          <div className="flex w-full min-w-0 items-center gap-2 text-sm" style={{ boxSizing: "border-box", padding: `${spacing.runSelectorPaddingY}px ${spacing.runSelectorPaddingX}px` }}>
            <span className="shrink-0">Run</span>
            <button
              ref={runTriggerRef}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={runMenuOpen}
              className="min-w-0 flex-1 rounded-md text-left"
              style={{ height: spacing.dropdownHeight, borderRadius: spacing.dropdownRadius, paddingLeft: spacing.dropdownPaddingX, paddingRight: spacing.dropdownPaddingX, fontSize: spacing.dropdownFontSize, background: spacing.dropdownBg as string, border: "none", color: "var(--foreground)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer" }}
              onFocus={(event) => { event.currentTarget.style.background = spacing.dropdownFocusBg as string; }}
              onBlur={(event) => { if (!runMenuOpen) event.currentTarget.style.background = spacing.dropdownBg as string; }}
              onClick={() => {
                if (runMenuOpen) { setRunMenuOpen(false); setRunMenuPosition(null); return; }
                const rect = runTriggerRef.current?.getBoundingClientRect();
                if (!rect) return;
                const menuHeight = Math.min(runs.length * 44 + 8, window.innerHeight * 0.5);
                const top = rect.bottom + menuHeight <= window.innerHeight - 8 ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
                setRunMenuPosition({ top, left: rect.left, width: rect.width });
                setRunMenuOpen(true);
              }}
            >
              <span className="min-w-0 truncate">{run ? runLabel(run) : "Select a run"}</span>
              <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, opacity: 0.5, transform: `rotate(${runMenuOpen ? 180 : 0}deg)`, transition: "transform 0.2s ease" }}>
                <HugeiconsIcon icon={ChevronDownIcon} size={16} />
              </span>
            </button>
            {runMenuOpen && runMenuPosition && createPortal(
              <>
                <button type="button" aria-label="Close run dropdown" className="fixed inset-0 z-[999] cursor-default" onClick={() => { setRunMenuOpen(false); setRunMenuPosition(null); }} />
                <div role="listbox" aria-label="Classification runs" className="overlay-pop" style={{ position: "fixed", top: runMenuPosition.top, left: runMenuPosition.left, width: runMenuPosition.width, maxHeight: "50vh", overflowY: "auto", zIndex: 1000, boxSizing: "border-box", borderRadius: spacing.dropdownMenuRadius, background: spacing.dropdownMenuBg as string, padding: spacing.dropdownMenuPadding }}>
                  {runs.map((item) => {
                    const active = item.runId === runId;
                    return <button key={item.runId} type="button" role="option" aria-selected={active} className="flex w-full items-center text-left" style={{ gap: spacing.dropdownItemGap, padding: `${spacing.dropdownItemPaddingY}px ${spacing.dropdownItemPaddingX}px`, borderRadius: spacing.dropdownItemRadius, fontSize: spacing.dropdownItemFontSize, color: "var(--foreground)", background: active ? spacing.dropdownHoverBg as string : "transparent", border: "none", cursor: "pointer", transition: "background 0.1s ease" }} onMouseEnter={(event) => { event.currentTarget.style.background = spacing.dropdownHoverBg as string; }} onMouseLeave={(event) => { event.currentTarget.style.background = active ? spacing.dropdownHoverBg as string : "transparent"; }} onClick={() => { setRunId(item.runId); setRunMenuOpen(false); setRunMenuPosition(null); }}>
                      <span style={{ width: 16, display: "inline-flex", flexShrink: 0 }}>{active && <HugeiconsIcon icon={CheckIcon} size={16} strokeWidth={2.5} />}</span>
                      <span className="min-w-0 flex-1 truncate">{runLabel(item)}</span>
                    </button>;
                  })}
                </div>
              </>, document.body
            )}
          </div>
        )}

        <div className="w-full min-w-0 max-h-[52vh] min-h-28 overflow-x-hidden overflow-y-auto rounded-md border divide-y" style={{ boxSizing: "border-box", padding: `${spacing.listPaddingY}px ${spacing.listPaddingX}px` }}>
          {!run && <p className="text-sm text-muted-foreground" style={{ padding: `${spacing.messagePaddingY}px ${spacing.messagePaddingX}px` }}>No classification runs are available yet.</p>}
          {run && run.results.length === 0 && (
            <p className="text-sm text-muted-foreground" style={{ padding: `${spacing.messagePaddingY}px ${spacing.messagePaddingX}px` }}>This historical run contains no item records.</p>
          )}
          {(run?.results || []).map((result) => {
            const bookmark = bookmarkById.get(result.id);
            return result.outcome === "suggestion" ? (
              <div key={result.id} className="flex w-full min-w-0 text-sm" style={{ boxSizing: "border-box", gap: spacing.itemGap, padding: `${spacing.itemPaddingY}px ${spacing.itemPaddingX}px` }}>
                <span className="min-w-0 flex-1" style={{ display: "flex", flexDirection: "column", gap: spacing.itemContentGap }}>
                  <span className="font-medium">{result.label} <span className="font-normal text-xs text-muted-foreground">· {result.reviewStatus || "legacy staged"} · {result.id}</span></span>
                  <span className="block line-clamp-3 whitespace-pre-wrap text-muted-foreground">
                    {bookmark?.text || "Bookmark text is unavailable in the current cache."}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Current category: {bookmark?.category || "unclassified"}
                  </span>
                </span>
              </div>
            ) : (
            <div key={`${result.id}-${result.outcome}`} className="w-full min-w-0 text-xs text-muted-foreground" style={{ boxSizing: "border-box", overflowWrap: "anywhere", padding: `${spacing.itemPaddingY}px ${spacing.itemPaddingX}px` }}>
              {result.outcome === "failed" ? "Failed" : "Abstained"} · bookmark {result.id} · {result.errorCode || result.status}
            </div>
            );
          })}
        </div>

        {error && <p role="alert" className="text-sm text-destructive" style={{ padding: `${spacing.messagePaddingY}px ${spacing.messagePaddingX}px` }}>{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
