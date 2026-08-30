"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ExpandableTabs } from "@/components/motion/expandable-tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import { TextIcon, UserIcon } from "@hugeicons/core-free-icons";
import type { BookmarkForRender } from "@/lib/spatial/dom-renderer";
import { cleanPostText, getTimelineEntries } from "@/lib/bookmark-utils";
import { useDialKit } from "dialkit";

interface SpatialFocusDetailsProps {
  bookmark: BookmarkForRender | null;
  phase: "closed" | "opening" | "opened" | "closing";
  isActive: boolean;
  isAnimating: boolean;
}

export function SpatialFocusDetails({ bookmark, phase, isActive, isAnimating }: SpatialFocusDetailsProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null);

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
  const text = cleanPostText(bookmark?.text || full?.text || "");
  const timeline = full ? getTimelineEntries(full) : [];

  const items = useMemo(
    () => [
      {
        id: "post",
        label: "Post",
        icon: <HugeiconsIcon icon={TextIcon} size={16} />,
        content: (
          <div
            className="max-h-[42vh] overflow-y-auto"
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

  const tabs = (
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
          root: "overlay-pop border-0 bg-popover",
          bar: "bg-transparent",
          tab: "text-muted-foreground hover:text-foreground border-0",
          activeTab: "text-foreground border-0",
          pill: "bg-muted border-0 shadow-none ring-0",
          panel: "bg-transparent",
        }}
      />
    </div>
  );

  // The original feed lives inside .app-shell (z-index: 0), while the ripple
  // takeover is appended directly to document.body at z-index 40000. Portal
  // the tabs to the same root so their intended 40002 layer is real.
  return createPortal(tabs, document.body);
}
