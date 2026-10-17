"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { ExpandableTabs } from "@/components/motion/expandable-tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import { TextIcon, UserIcon } from "@hugeicons/core-free-icons";
import type { BookmarkForRender } from "@/lib/spatial/dom-renderer";
import { cleanPostText, getTimelineEntries, sentenceCase } from "@/lib/bookmark-utils";
import { useDialKit } from "dialkit";

interface SpatialFocusDetailsProps {
  bookmark: BookmarkForRender | null;
  bookmarkIds: string[];
  onNavigate: (bookmarkId: string, direction: -1 | 1) => Promise<void>;
  phase: "closed" | "opening" | "opened" | "closing";
  isActive: boolean;
  isAnimating: boolean;
}

export function SpatialFocusDetails({ bookmark, bookmarkIds, onNavigate, phase, isActive, isAnimating }: SpatialFocusDetailsProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const currentIndex = bookmark ? bookmarkIds.indexOf(bookmark.id) : -1;
  const [requestedIndex, setRequestedIndex] = useState(currentIndex);
  const requestedIndexRef = useRef(currentIndex);
  const pendingRequestsRef = useRef(0);
  const displayedBookmarkIdRef = useRef(bookmark?.id ?? null);
  displayedBookmarkIdRef.current = bookmark?.id ?? null;
  const canNavigate = phase === "opened" && !isAnimating && currentIndex >= 0;
  const navigate = (direction: -1 | 1) => {
    if (!canNavigate) return;
    const nextIndex = requestedIndexRef.current + direction;
    const nextId = bookmarkIds[nextIndex];
    if (!nextId) return;
    requestedIndexRef.current = nextIndex;
    setRequestedIndex(nextIndex);
    pendingRequestsRef.current += 1;
    void onNavigate(nextId, direction).finally(() => {
      pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
    });
  };

  useEffect(() => {
    if (pendingRequestsRef.current > 0) return;
    const displayedIndex = bookmarkIds.indexOf(displayedBookmarkIdRef.current || "");
    requestedIndexRef.current = displayedIndex;
    setRequestedIndex(displayedIndex);
  }, [bookmark?.id, bookmarkIds, phase]);

  useEffect(() => {
    if (!canNavigate) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.isContentEditable ||
        target.closest("input, textarea, select, button, a, [role='button'], [role='tab'], [role='slider'], [role='combobox'], [role='menuitem'], summary")
      ) return;

      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const nextId = bookmarkIds[requestedIndexRef.current + direction];
      if (!nextId) return;
      event.preventDefault();
      navigate(direction);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [bookmarkIds, canNavigate, currentIndex, onNavigate]);

  // Reset to Post tab when a new bookmark is focused
  useEffect(() => {
    setActiveTab(null);
  }, [bookmark?.id, phase]);

  if (typeof window !== "undefined" && (window as any).__SPATIAL_FOCUS_DEBUG) {
    console.log(`[SpatialFocusDetails] render isActive=${isActive} isAnimating=${isAnimating} bookmark=${!!bookmark}`);
  }

  const focusDetailsParams = useDialKit("Focus Details", {
    cardPaddingX: [12, 0, 32, 1],
    cardPaddingY: [12, 0, 32, 1],
    contentGap: [12, 0, 32, 1],
    dividerGap: [6, 0, 24, 1],
    dividerPaddingTop: [12, 0, 24, 1],
    barGap: [2, 0, 16, 1],
    activeLeftPad: [10, 0, 20, 1],
    activeRightPad: [16, 0, 32, 1],
    labelGap: [7, 0, 16, 1],
    panelGap: [4, 0, 16, 1],
    authorAvatarSize: [36, 24, 48, 1],
    postWidth: [340, 200, 500, 10],
    authorWidth: [300, 200, 500, 10],
  });

  const full = bookmark?.bookmark;
  const authorName = full?.authorName || cleanPostText(bookmark?.text || "").slice(0, 20) || "Unknown";
  const handle = full?.authorHandle ? `@${full.authorHandle}` : full?.authorName ? `@${full.authorName.replace(/\s+/g, "").toLowerCase()}` : "@unknown";
  const text = sentenceCase(cleanPostText(bookmark?.text || full?.text || ""));
  const timeline = full ? getTimelineEntries(full) : [];

  const items = useMemo(
    () => [
      {
        id: "post",
        label: "Post",
        icon: <HugeiconsIcon icon={TextIcon} size={16} />,
        content: (
          <div
            className="search-scrollbar max-h-[42vh] overflow-y-auto"
            style={{
              width: `${focusDetailsParams.postWidth as number}px`,
              padding: `${focusDetailsParams.cardPaddingY as number}px ${focusDetailsParams.cardPaddingX as number}px`,
            }}
          >
            <div className="flex flex-col" style={{ gap: `${focusDetailsParams.contentGap as number}px` }}>
              <p className="text-[13px] leading-[1.5] text-foreground whitespace-pre-wrap break-words">
                {text || "No content"}
              </p>
              {timeline.length > 0 && (
                <div
                  className="flex flex-col border-t border-border"
                  style={{
                    gap: `${focusDetailsParams.dividerGap as number}px`,
                    paddingTop: `${focusDetailsParams.dividerPaddingTop as number}px`,
                  }}
                >
                  {timeline.map((entry) => (
                    <div key={entry.label} className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {entry.label}
                      </span>
                      <span className="text-[11px] font-medium text-foreground">{entry.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ),
      },
      {
        id: "author",
        label: handle,
        icon: <HugeiconsIcon icon={UserIcon} size={16} />,
        content: (
          <div
            style={{
              width: `${focusDetailsParams.authorWidth as number}px`,
              padding: `${focusDetailsParams.cardPaddingY as number}px ${focusDetailsParams.cardPaddingX as number}px`,
            }}
          >
            <div className="flex items-start" style={{ gap: `${focusDetailsParams.contentGap as number}px` }}>
              <div
                className="flex shrink-0 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground"
                style={{
                  width: `${focusDetailsParams.authorAvatarSize as number}px`,
                  height: `${focusDetailsParams.authorAvatarSize as number}px`,
                  fontSize: `${Math.max(11, (focusDetailsParams.authorAvatarSize as number) * 0.36)}px`,
                }}
              >
                {authorName.charAt(0).toUpperCase()}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold leading-none text-foreground">
                  {authorName}
                </span>
                <span className="truncate text-[11px] font-medium text-muted-foreground">{handle}</span>
                {full?.authorHandle && (
                  <a
                    href={`https://x.com/${full.authorHandle}`}
                    target="_blank"
                    rel="noopener"
                    className="mt-1 inline-flex text-[11px] font-medium text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View on X →
                  </a>
                )}
              </div>
            </div>
            {/* Posted/Synced moved to Post tab only — keep profile card clean for author identity */}

          </div>
        ),
      },
    ],
    [
      authorName,
      handle,
      text,
      timeline,
      focusDetailsParams.postWidth,
      focusDetailsParams.authorWidth,
      focusDetailsParams.cardPaddingX,
      focusDetailsParams.cardPaddingY,
      focusDetailsParams.contentGap,
      focusDetailsParams.dividerGap,
      focusDetailsParams.dividerPaddingTop,
      focusDetailsParams.authorAvatarSize,
    ]
  );

  if (!bookmark || phase !== "opened") return null;

  const stopPresentationEvent = (event: SyntheticEvent) => event.stopPropagation();
  const arrowButtonClass = "pointer-events-auto fixed top-1/2 z-[40003] inline-flex size-10 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0 text-foreground transition-opacity hover:opacity-70 active:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30";
  const tabs = (
    <>
      <div className="fixed bottom-6 right-6 z-[40002] pointer-events-auto">
        <ExpandableTabs
          items={items}
          value={activeTab}
          onValueChange={(id) => {
            if (typeof window !== "undefined" && (window as unknown as { __SPATIAL_FOCUS_DEBUG?: boolean }).__SPATIAL_FOCUS_DEBUG) {
              console.log(`[SpatialFocusDetails] onValueChange ${id} (prev ${activeTab})`);
            }
            setActiveTab(id);
          }}
          defaultValue={null}
          disableExpand
          barGap={focusDetailsParams.barGap as number}
          activeLeftPad={focusDetailsParams.activeLeftPad as number}
          activeRightPad={focusDetailsParams.activeRightPad as number}
          labelGap={focusDetailsParams.labelGap as number}
          panelGap={focusDetailsParams.panelGap as number}
          classNames={{
            root: "overlay-pop border-0 bg-popover focus-details-card",
            bar: "bg-transparent",
            tab: "text-muted-foreground hover:text-foreground border-0",
            activeTab: "text-foreground border-0",
            pill: "bg-muted border-0 shadow-none ring-0",
            panel: "bg-transparent",
          }}
        />
      </div>
      <div className="pointer-events-none fixed inset-0 z-[40002]" role="group" aria-label="Bookmark navigation">
        <button
          type="button"
          aria-label="Previous bookmark"
          className={`${arrowButtonClass} left-4`}
          disabled={!canNavigate || requestedIndex <= 0}
          onPointerDown={stopPresentationEvent}
          onClick={(event) => { stopPresentationEvent(event); navigate(-1); }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <button
          type="button"
          aria-label="Next bookmark"
          className={`${arrowButtonClass} right-4`}
          disabled={!canNavigate || requestedIndex < 0 || requestedIndex >= bookmarkIds.length - 1}
          onPointerDown={stopPresentationEvent}
          onClick={(event) => { stopPresentationEvent(event); navigate(1); }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
    </>
  );

  // The original feed lives inside .app-shell (z-index: 0), while the ripple
  // takeover is appended directly to document.body at z-index 40000. Portal
  // the tabs to the same root so their intended 40002 layer is real.
  return createPortal(tabs, document.body);
}
