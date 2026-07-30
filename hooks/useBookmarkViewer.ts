"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate } from "motion";
import type { AnimationOptions, DOMKeyframesDefinition } from "motion";
import { iconPath, sortIcons } from "@/lib/icons";
import {
  DEFAULT_SORT,
  STORAGE_KEY,
  buildMasonryLayout,
  clamp,
  escapeHtml,
  formatCount,
  formatDate,
  formatNavigatorDate,
  formatNavigatorSubline,
  getFilteredBookmarks,
  getSortLabel,
  getTimelineText,
  isLowSpecDevice,
  isVerticalFeedView,
  lineClampText,
  twitterImageUrl,
} from "@/lib/bookmark-utils";
import { apiFetch } from "@/lib/client-api";
import type {
  Bookmark,
  BookmarkFolder,
  FacetType,
  PersistedState,
  SortConfig,
  SortMode,
  ViewMode,
} from "@/lib/types";
import type { LayoutItem } from "@/lib/bookmark-utils";

const DRAG_THRESHOLD = 5;

interface ScrubberMarkerData {
  bookmark: Bookmark;
  progress: number;
  top: number;
  density: string;
  weekStart?: string;
  weekCount?: number;
}

interface ScrubberDayAnchor {
  id: string;
  top: number;
  label: string;
  date: string;
  count: number;
}

interface ScrubberAnchor {
  id: string;
  top: number;
  label: string;
  days: ScrubberDayAnchor[];
  weekCount: number;
}

interface LightboxItemState {
  element: HTMLDivElement;
  bookmark: Bookmark;
  resizeAnimation?: ReturnType<typeof animate>;
  _startX?: number;
  _startY?: number;
  _startW?: number;
  _startH?: number;
  _endX?: number;
  _endY?: number;
  _endW?: number;
  _endH?: number;
}

const getLightboxTargetFrame = (
  media: { width: number; height: number },
  viewportWidth: number,
  viewportHeight: number
) => {
  const margin = viewportWidth < 420 ? 12 : viewportWidth < 720 ? 18 : 48;
  const captionReserve = viewportHeight < 560 ? 64 : viewportWidth < 720 ? 86 : 108;
  const captionGap = viewportHeight < 560 ? 8 : 16;
  const maxWidth = Math.max(120, viewportWidth - margin * 2);
  const maxHeight = Math.max(120, viewportHeight - margin * 2 - captionReserve - captionGap);
  const aspectRatio = media.width > 0 && media.height > 0 ? media.width / media.height : 1;

  let width = maxWidth;
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  const groupHeight = height + captionGap + captionReserve;
  const x = (viewportWidth - width) / 2;
  const y = Math.max(margin, (viewportHeight - groupHeight) / 2);
  const infoTop = Math.min(
    viewportHeight - margin - captionReserve,
    y + height + captionGap
  );

  return { x, y, width, height, infoTop };
};

const getViewportSize = () => {
  const visualViewport = window.visualViewport;
  return {
    width: Math.floor(visualViewport?.width || window.innerWidth),
    height: Math.floor(visualViewport?.height || window.innerHeight),
  };
};

function renderScrubberPreviewCardImpl(marker: ScrubberMarkerData) {
  const weekLabel = marker.weekStart
    ? new Date(marker.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  const countLabel = marker.weekCount != null ? ` • ${marker.weekCount}` : "";
  return `
      <div class="scrubber-preview-card">
        <div class="scrubber-preview-kicker">${weekLabel ? `Week of ${weekLabel}${countLabel}` : escapeHtml(formatNavigatorSubline(marker.bookmark))}</div>
        <div class="scrubber-preview-title">${escapeHtml(formatNavigatorDate(marker.bookmark))}</div>
      </div>
    `;
}

export function useBookmarkViewer() {
  const feedShellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const lightboxInfoRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLElement>(null);
  const scrubberRailRef = useRef<HTMLDivElement>(null);
  const scrubberMarkersRef = useRef<HTMLDivElement>(null);
  const scrubberPreviewRef = useRef<HTMLDivElement>(null);
  const scrubberThumbRef = useRef<HTMLDivElement>(null);

  const [allBookmarks, setAllBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState("All");
  const [activeView, setActiveView] = useState<ViewMode>("media");
  const activeViewRef = useRef<ViewMode>(activeView);
  useEffect(() => { activeViewRef.current = activeView }, [activeView])
  const [activeSort, setActiveSort] = useState<SortConfig>(DEFAULT_SORT);
  const [activeSearch, setActiveSearch] = useState("");
  const [activeFacetType, setActiveFacetType] = useState<FacetType>("all");
  const [activeFacetValue, setActiveFacetValue] = useState("All bookmarks");
  const [displayBookmarks, setDisplayBookmarks] = useState<Bookmark[]>([]);
  const [darkMode, setDarkMode] = useState(false);

  const [syncStatusText, setSyncStatusText] = useState("Local cache ready");
  const [syncStatusTone, setSyncStatusTone] = useState<
    "idle" | "working" | "success" | "error"
  >("idle");
  const [syncBusy, setSyncBusy] = useState(false);
  const [reindexBusy, setReindexBusy] = useState(false);
  const [scrubberVisible, setScrubberVisible] = useState(false);
  const [scrubberActive, setScrubberActive] = useState(false);
  const [scrubberMarkers, setScrubberMarkers] = useState<ScrubberMarkerData[]>([]);
  const [scrubberAnchors, setScrubberAnchors] = useState<ScrubberAnchor[]>([]);
  const [scrubberDayAnchors, setScrubberDayAnchors] = useState<ScrubberDayAnchor[]>([]);
  const [scrubberFrame, setScrubberFrame] = useState({ top: 18, height: 0 });
  const [scrubberPreviewHtml, setScrubberPreviewHtml] = useState("");
  const [scrubberPreviewTop, setScrubberPreviewTop] = useState(0);
  const [scrubberPreviewVisible, setScrubberPreviewVisible] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxTitle, setLightboxTitle] = useState("");
  const [lightboxLinkHref, setLightboxLinkHref] = useState("#");
  const [lightboxLinkText, setLightboxLinkText] = useState("");
  const [lightboxMeta, setLightboxMeta] = useState("");
  const [containerHeight, setContainerHeight] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const [gridHeight, setGridHeight] = useState(0);
  const [feedMode, setFeedMode] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const syncChannelRef = useRef<BroadcastChannel | null>(null);

  const engineRef = useRef({
    layoutItems: [] as LayoutItem[],
    colWidth: 0,
    totalWidth: 0,
    maxColHeight: 0,
    contentBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    feedScrollY: 0,
    renderQueued: false,
    scrubberData: [] as ScrubberMarkerData[],
    activeScrubberIndex: -1,
    scrubberHideTimer: null as ReturnType<typeof setTimeout> | null,
    scrubberDragCleanup: null as (() => void) | null,
    scrubberPointerProgress: null as number | null,
    scrubberIsDragging: false,
    weekBookmarks: [] as Bookmark[][],
    dayBookmarks: [] as Bookmark[][],
    scrubberYPositions: [] as number[],
    pool: [] as HTMLDivElement[],
    freePool: [] as HTMLDivElement[],
    activeMap: new Map<
      string,
      { poolEl: HTMLDivElement; layoutItem: LayoutItem; screenX: number; screenY: number }
    >(),
    elToBookmark: new WeakMap<HTMLDivElement, Bookmark>(),
    lightboxClone: null as HTMLDivElement | null,
    lightboxItem: null as LightboxItemState | null,
    lightboxAnimating: false,
    lightboxOpen: false,
    needsPostLightboxRelayout: false,
    cameraOffset: { x: 0, y: 0 },
    targetOffset: { x: 0, y: 0 },
    isDragging: false,
    previousMousePosition: { x: 0, y: 0 },
    dragStartPosition: { x: 0, y: 0 },
    hasDragged: false,
    touchStart: null as { x: number; y: number } | null,
    config: {
      MEDIA_COLS: 5,
      CARD_COLS: 4,
      GAP: 18,
      easingFactor: 0.18,
      POOL_SIZE: isLowSpecDevice() ? 260 : 420,
      BUFFER: isLowSpecDevice() ? 320 : 600,
    },
  });

  const saveState = useCallback(() => {
    try {
      const state: PersistedState = {
        darkMode,
        activeFolder,
        activeView,
        activeSort,
        activeSearch,
        activeFacetType,
        activeFacetValue,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to persist state to localStorage", e);
    }
  }, [
    activeFacetType,
    activeFacetValue,
    activeFolder,
    activeSearch,
    activeSort,
    activeView,
    darkMode,
  ]);

  const getViewportWidth = () => viewportRef.current?.clientWidth || window.innerWidth;
  const getViewportHeight = () =>
    viewportRef.current?.clientHeight || window.innerHeight;
  const getScrollableDistance = () => {
    const viewport = viewportRef.current;
    if (!viewport) return 0;
    return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  };

  const renderCardContent = useCallback(
    (element: HTMLDivElement, bookmark: Bookmark, item: LayoutItem, view: ViewMode) => {
      const mediaWrap = element.querySelector<HTMLElement>(".grid-item-media");
      const body = element.querySelector<HTMLElement>(".grid-item-body");
      const author = element.querySelector<HTMLElement>(".grid-item-author");
      const handle = element.querySelector<HTMLAnchorElement>(".grid-item-handle");
      const text = element.querySelector<HTMLElement>(".grid-item-text");
      const timeline = element.querySelector<HTMLElement>(".grid-item-timeline");
      const stats = element.querySelector<HTMLElement>(".grid-item-stats");
      const image = element.querySelector<HTMLImageElement>("img");
      const hasImage = bookmark.images && bookmark.images.length > 0;

      element.classList.toggle("grid-item-card", view === "card");
      element.classList.toggle("grid-item-card-text-only", view === "card" && !hasImage);
      if (mediaWrap) mediaWrap.style.display = hasImage ? "" : "none";
      if (body) body.style.display = view === "card" ? "" : "none";

      if (hasImage && mediaWrap && image) {
        const imageHeight =
          view === "card"
            ? clamp(
                item.w / (bookmark.images[0].width / bookmark.images[0].height),
                170,
                320
              )
            : item.h;
        mediaWrap.style.height = `${imageHeight}px`;
        mediaWrap.classList.remove("loading-image");

        const source = twitterImageUrl(
          bookmark.images[0].url,
          view === "card" ? "large" : "medium"
        );
        if (image.src !== source) {
          mediaWrap.classList.add("loading-image");
          image.onload = () => mediaWrap.classList.remove("loading-image");
          image.onerror = () => mediaWrap.classList.remove("loading-image");
          image.src = source;
          image.alt = bookmark.text.substring(0, 80);
        }
      } else if (image) {
        image.removeAttribute("src");
        image.alt = "";
        if (mediaWrap) mediaWrap.classList.remove("loading-image");
      }

      if (view === "card" && author && handle && text && timeline && stats) {
        author.textContent = bookmark.authorName || `@${bookmark.authorHandle}`;
        handle.textContent = `@${bookmark.authorHandle}`;
        handle.href = bookmark.url;
        text.textContent = lineClampText(bookmark.text || "", hasImage ? 150 : 220);
        timeline.textContent = getTimelineText(bookmark);
        timeline.style.display = timeline.textContent ? "" : "none";
        stats.innerHTML = `
          <span>Likes ${formatCount(bookmark.likeCount)}</span>
          <span>Reposts ${formatCount(bookmark.repostCount)}</span>
          <span>Bookmarks ${formatCount(bookmark.bookmarkCount)}</span>
        `;
      }

      element.classList.remove("loading");

      const summaryText = lineClampText(
        bookmark.text || bookmark.authorName || bookmark.authorHandle || "Bookmark",
        120
      );
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", `Open bookmark: ${summaryText}`);
    },
    []
  );

  const renderVisibleItems = useCallback(() => {
    const engine = engineRef.current;
    const viewport = viewportRef.current;
    const grid = gridRef.current;
    if (!viewport || !grid) return;

    const view = activeViewRef.current;
    const feedModeActive = isVerticalFeedView(view);
    const viewportWidth = getViewportWidth();
    const viewportHeight = getViewportHeight();
    const buffer = engine.config.BUFFER;
    const lightboxElement = engine.lightboxItem?.element || null;

    const cameraX = engine.cameraOffset.x;
    const cameraY = engine.cameraOffset.y;
    const targetY = engine.targetOffset.y;
    const visibleThisFrame = new Set<string>();

    for (const item of engine.layoutItems) {
      const screenX = feedModeActive ? item.x : item.x - cameraX;
      const screenY = feedModeActive ? item.y : item.y - cameraY;
      const visibleAtCamera = feedModeActive
        ? item.y + item.h >= cameraY - buffer && item.y <= cameraY + viewportHeight + buffer
        : screenX + item.w >= -buffer &&
          screenX <= viewportWidth + buffer &&
          screenY + item.h >= -buffer &&
          screenY <= viewportHeight + buffer;
      const visibleAtTarget = feedModeActive
        ? item.y + item.h >= targetY - buffer && item.y <= targetY + viewportHeight + buffer
        : item.x - engine.targetOffset.x + item.w >= -buffer &&
          item.x - engine.targetOffset.x <= viewportWidth + buffer &&
          item.y - targetY + item.h >= -buffer &&
          item.y - targetY <= viewportHeight + buffer;

      if (!visibleAtCamera && !visibleAtTarget) continue;

      visibleThisFrame.add(item.key);
      const existing = engine.activeMap.get(item.key);
      if (existing) {
        if (existing.poolEl !== lightboxElement) {
          existing.poolEl.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
        }
        existing.screenX = screenX;
        existing.screenY = screenY;
      } else {
        const poolElement = engine.freePool.pop();
        if (!poolElement) continue;

        poolElement.style.display = "";
        poolElement.style.width = `${item.w}px`;
        poolElement.style.height = `${item.h}px`;
        poolElement.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
        renderCardContent(poolElement, item.bookmark, item, view);
        engine.elToBookmark.set(poolElement, item.bookmark);
        engine.activeMap.set(item.key, {
          poolEl: poolElement,
          layoutItem: item,
          screenX,
          screenY,
        });
      }
    }

    for (const [visKey, entry] of engine.activeMap) {
      if (!visibleThisFrame.has(visKey) && entry.poolEl !== lightboxElement) {
        entry.poolEl.style.display = "none";
        entry.poolEl.style.visibility = "";
        engine.freePool.push(entry.poolEl);
        engine.elToBookmark.delete(entry.poolEl);
        engine.activeMap.delete(visKey);
      }
    }
  }, [renderCardContent]);

  const requestRender = useCallback(() => {
    const engine = engineRef.current;
    if (engine.renderQueued) return;
    engine.renderQueued = true;
    requestAnimationFrame(() => {
      engine.renderQueued = false;
      renderVisibleItems();
    });
  }, [renderVisibleItems]);

  const buildScrubberData = useCallback((bookmarksList: Bookmark[]) => {
    const engine = engineRef.current;
    if (!isVerticalFeedView(activeView) || bookmarksList.length === 0) {
      engine.scrubberData = [];
      engine.weekBookmarks = [];
      engine.dayBookmarks = [];
      engine.scrubberYPositions = [];
      setScrubberMarkers([]);
      setScrubberAnchors([]);
      setScrubberDayAnchors([]);
      return;
    }

    const sorted = [...bookmarksList].sort(
      (a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()
    );

    const earliestMs = new Date(sorted[0].postedAt).getTime();
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const todayMs = today.getTime();
    const totalMs = Math.max(1, todayMs - earliestMs);

    const weekOrigin = new Date(earliestMs);
    weekOrigin.setDate(weekOrigin.getDate() - weekOrigin.getDay());
    weekOrigin.setHours(0, 0, 0, 0);

    const weeks: { start: Date; bookmarks: Bookmark[] }[] = [];
    let cursor = new Date(weekOrigin);
    while (cursor.getTime() <= todayMs) {
      const next = new Date(cursor);
      next.setDate(next.getDate() + 7);
      weeks.push({ start: new Date(cursor), bookmarks: [] });
      cursor = next;
    }

    let wi = 0;
    for (const bm of sorted) {
      const bmMs = new Date(bm.postedAt).getTime();
      while (wi < weeks.length - 1 && bmMs >= weeks[wi + 1].start.getTime()) {
        wi++;
      }
      weeks[wi].bookmarks.push(bm);
    }

    const markers: ScrubberMarkerData[] = [];
    const weekBookmarksList: Bookmark[][] = [];
    const anchors: ScrubberAnchor[] = [];
    const dayAnchorsList: ScrubberDayAnchor[] = [];
    const dayBookmarksList: Bookmark[][] = [];

    const layoutMap = new Map<string, LayoutItem>()
    for (const li of engine.layoutItems) {
      layoutMap.set(li.bookmark.id, li)
    }

    for (const week of weeks) {
      if (week.bookmarks.length === 0) continue;
      const firstBookmark = week.bookmarks[0];
      const firstItem = layoutMap.get(firstBookmark.id)
      const weekLabel = week.start.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const weekMs = week.start.getTime() - earliestMs;
      const progress = weekMs / totalMs;
      markers.push({
        bookmark: firstBookmark,
        progress: clamp(progress, 0, 1),
        top: firstItem?.y ?? 0,
        density: "",
        weekStart: week.start.toISOString(),
        weekCount: week.bookmarks.length,
      });

      const dayGroups = new Map<string, Bookmark[]>();
      for (const bm of week.bookmarks) {
        const dayKey = new Date(bm.postedAt).toDateString();
        if (!dayGroups.has(dayKey)) dayGroups.set(dayKey, []);
        dayGroups.get(dayKey)!.push(bm);
      }

      const weekDays: ScrubberDayAnchor[] = [];
      for (const [, dayBookmarks] of dayGroups) {
        const firstDayBm = dayBookmarks[0];
        const firstDayItem = layoutMap.get(firstDayBm.id);
        const dayLabel = new Date(firstDayBm.postedAt).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        const dayAnchor: ScrubberDayAnchor = {
          id: `scrubber-day-${dayAnchorsList.length}`,
          top: firstDayItem?.y ?? 0,
          label: dayLabel,
          date: new Date(firstDayBm.postedAt).toISOString(),
          count: dayBookmarks.length,
        };
        weekDays.push(dayAnchor);
        dayAnchorsList.push(dayAnchor);
        dayBookmarksList.push(dayBookmarks);
      }

      anchors.push({
        id: `scrubber-week-${anchors.length}`,
        top: firstItem?.y ?? 0,
        label: `Week of ${weekLabel}`,
        days: weekDays,
        weekCount: week.bookmarks.length,
      });
      weekBookmarksList.push(week.bookmarks);
    }

    const yPositions: number[] = [];
    for (const bm of sorted) {
      const item = layoutMap.get(bm.id)
      yPositions.push(item ? item.y : 0);
    }

    engine.scrubberData = markers;
    engine.weekBookmarks = weekBookmarksList;
    engine.dayBookmarks = dayBookmarksList;
    engine.scrubberYPositions = yPositions;
    setScrubberMarkers(markers);
    setScrubberAnchors(anchors);
    setScrubberDayAnchors(dayAnchorsList);
  }, [activeView]);

  const renderScrubberPreviewCard = renderScrubberPreviewCardImpl;

  const findClosestScrubberIndexByProgress = (progress: number) => {
    const engine = engineRef.current;
    if (engine.scrubberData.length === 0) return -1;
    let closestIndex = 0;
    let closestDistance = Infinity;
    engine.scrubberData.forEach((item, index) => {
      const distance = Math.abs(item.progress - progress);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    return closestIndex;
  };

  const findCurrentWeekIndex = () => {
    const engine = engineRef.current;
    const viewport = viewportRef.current;
    if (!viewport || engine.layoutItems.length === 0 || !engine.weekBookmarks?.length)
      return -1;

    const scrollY = viewport.scrollTop;
    const items = engine.layoutItems;
    let bestIdx = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].y <= scrollY + 100) bestIdx = i;
      else break;
    }

    const currentItem = items[bestIdx];
    if (!currentItem) return -1;

    const bmId = currentItem.bookmark.id;
    for (let w = 0; w < engine.weekBookmarks.length; w++) {
      if (engine.weekBookmarks[w]?.some((b) => b.id === bmId)) return w;
    }

    return -1;
  };

  const updateScrubberMarkerStyles = useCallback(() => {
    const scrubber = scrubberRef.current;
    const markersContainer = scrubberMarkersRef.current;
    const thumb = scrubberThumbRef.current;
    if (!scrubber?.classList.contains("visible") || !markersContainer) return;

    const engine = engineRef.current;
    const currentIndex = findCurrentWeekIndex();
    const hoverIndex =
      engine.scrubberPointerProgress == null
        ? -1
        : findClosestScrubberIndexByProgress(engine.scrubberPointerProgress);

    markersContainer.querySelectorAll(".scrubber-marker").forEach((markerElement, index) => {
      const marker = engine.scrubberData[index];
      if (!marker) return;

      let width = 8;
      let opacity = 0.3;
      const isCurrent = index === currentIndex;
      const isHover = index === hoverIndex;

      if (isCurrent) {
        opacity = 0.85;
      }
      if (isHover) {
        width = 22;
        opacity = 1;
      }

      (markerElement as HTMLElement).style.setProperty("--marker-width", `${width}px`);
      (markerElement as HTMLElement).style.setProperty("--marker-opacity", String(opacity));
      markerElement.classList.toggle("current", isCurrent);
      markerElement.classList.toggle("engaged", isHover);
    });

    if (thumb) {
      const scrollableDistance = getScrollableDistance();
      const scrollY = viewportRef.current?.scrollTop || 0;
      const progress = scrollableDistance > 0 ? clamp(scrollY / scrollableDistance, 0, 1) : 0;
      const rail = scrubberRailRef.current;
      if (rail) {
        thumb.style.top = `${progress * rail.clientHeight}px`;
      }
    }
  }, []);

  const hideScrubberPreview = useCallback(
    (immediate = false) => {
      const engine = engineRef.current;
      const preview = scrubberPreviewRef.current;
      if (!preview) return;

      if (engine.scrubberHideTimer) {
        clearTimeout(engine.scrubberHideTimer);
        engine.scrubberHideTimer = null;
      }

      engine.activeScrubberIndex = -1;
      updateScrubberMarkerStyles();

      if (immediate) {
        preview.style.opacity = "0";
        preview.style.transform = "translate3d(6px, -50%, 0) scale(0.988)";
        preview.setAttribute("aria-hidden", "true");
        setScrubberPreviewVisible(false);
        return;
      }

      const hideKeyframes = {
        opacity: [1, 0] as const,
        transform: [
          "translate3d(0, -50%, 0) scale(1)",
          "translate3d(6px, -50%, 0) scale(0.988)",
        ] as const,
      } satisfies DOMKeyframesDefinition;
      const hideOptions = {
        duration: 0.18,
        ease: [0.22, 1, 0.36, 1] as const,
      } satisfies AnimationOptions;
      animate(preview, hideKeyframes, hideOptions).then(() => {
        preview.setAttribute("aria-hidden", "true");
        setScrubberPreviewVisible(false);
      });
    },
    [updateScrubberMarkerStyles]
  );

  const showScrubberPreview = useCallback(
    (index: number) => {
      const engine = engineRef.current;
      const preview = scrubberPreviewRef.current;
      const rail = scrubberRailRef.current;
      const marker = engine.scrubberData[index];
      if (!marker || !preview || !rail) return;

      if (engine.scrubberHideTimer) {
        clearTimeout(engine.scrubberHideTimer);
        engine.scrubberHideTimer = null;
      }

      const wasSameMarker =
        engine.activeScrubberIndex === index &&
        preview.getAttribute("aria-hidden") === "false";
      engine.activeScrubberIndex = index;
      updateScrubberMarkerStyles();
      setScrubberPreviewHtml(renderScrubberPreviewCard(marker));
      setScrubberPreviewTop(
        clamp(marker.progress * rail.clientHeight, 52, rail.clientHeight - 52)
      );
      preview.setAttribute("aria-hidden", "false");
      setScrubberPreviewVisible(true);

      if (wasSameMarker) return;

      const showKeyframes = {
        opacity: [0, 1] as const,
        transform: [
          "translate3d(6px, -50%, 0) scale(0.988)",
          "translate3d(0, -50%, 0) scale(1)",
        ] as const,
      } satisfies DOMKeyframesDefinition;
      const showOptions = {
        duration: 0.2,
        ease: [0.22, 1, 0.36, 1] as const,
      } satisfies AnimationOptions;
      animate(preview, showKeyframes, showOptions);
    },
    [updateScrubberMarkerStyles]
  );

  const updateViewportMode = useCallback(() => {
    const viewport = viewportRef.current;
    const container = containerRef.current;
    const grid = gridRef.current;
    const engine = engineRef.current;
    if (!viewport || !container || !grid) return;

    const feedModeActive = isVerticalFeedView(activeView);
    setFeedMode(feedModeActive);

    if (feedModeActive) {
      viewport.classList.add("feed-mode");
      container.style.position = "relative";
      container.style.inset = "0";
      container.style.width = "100%";
      const height = Math.max(engine.maxColHeight, getViewportHeight());
      container.style.height = `${height}px`;
      grid.style.width = `${engine.totalWidth}px`;
      grid.style.height = `${height}px`;
      setContainerHeight(height);
      setGridWidth(engine.totalWidth);
      setGridHeight(height);
      return;
    }

    viewport.classList.remove("feed-mode");
    viewport.scrollTop = 0;
    container.style.position = "absolute";
    container.style.inset = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    grid.style.width = "100%";
    grid.style.height = "100%";
    setContainerHeight(0);
    setGridWidth(0);
    setGridHeight(0);
  }, [activeView]);

  const resetViewportAndRebuild = useCallback(
    (bookmarks: Bookmark[], view: ViewMode) => {
      const engine = engineRef.current;
      const viewport = viewportRef.current;
      engine.cameraOffset = { x: 0, y: 0 };
      engine.targetOffset = { x: 0, y: 0 };

      for (const [visKey, entry] of engine.activeMap) {
        entry.poolEl.style.display = "none";
        engine.freePool.push(entry.poolEl);
        engine.activeMap.delete(visKey);
      }

      if (viewport) viewport.scrollTop = 0;

      const layout = buildMasonryLayout(
        bookmarks,
        view,
        getViewportWidth(),
        getViewportHeight(),
        engine.config.MEDIA_COLS,
        engine.config.CARD_COLS,
        engine.config.GAP
      );

      engine.layoutItems = layout.layoutItems;
      engine.colWidth = layout.colWidth;
      engine.totalWidth = layout.totalWidth;
      engine.maxColHeight = layout.maxColHeight;
      engine.contentBounds = layout.contentBounds;

      updateViewportMode();
      buildScrubberData(bookmarks);
      setScrubberVisible(isVerticalFeedView(view) && engine.scrubberData.length > 1);
      setScrubberActive(isVerticalFeedView(view) && engine.scrubberData.length > 1);
      engine.cameraOffset.y = clamp(
        engine.cameraOffset.y,
        engine.contentBounds.minY,
        engine.contentBounds.maxY
      );
      engine.targetOffset.y = clamp(
        engine.targetOffset.y,
        engine.contentBounds.minY,
        engine.contentBounds.maxY
      );
      renderVisibleItems();
    },
    [buildScrubberData, renderVisibleItems, updateViewportMode]
  );

  const createPool = useCallback(() => {
    const grid = gridRef.current;
    const engine = engineRef.current;
    if (!grid) return;

    grid.innerHTML = "";
    engine.pool = [];
    engine.freePool = [];
    engine.activeMap.clear();

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < engine.config.POOL_SIZE; index += 1) {
      const element = document.createElement("div");
      element.className = "grid-item loading";
      element.style.display = "none";
      element.innerHTML = `
        <div class="grid-item-media">
          <img src="" alt="" loading="lazy" decoding="async">
        </div>
        <div class="grid-item-body">
          <div class="grid-item-head">
            <div class="grid-item-author"></div>
            <a class="grid-item-handle" href="#" target="_blank" rel="noopener"></a>
          </div>
          <p class="grid-item-text"></p>
          <div class="grid-item-timeline"></div>
          <div class="grid-item-stats"></div>
        </div>
      `;
      fragment.appendChild(element);
      engine.pool.push(element);
      engine.freePool.push(element);
    }
    grid.appendChild(fragment);
  }, []);

  const refreshDisplay = useCallback(
    (
      bookmarks: Bookmark[],
      folder: string,
      search: string,
      facetType: FacetType,
      facetValue: string,
      sort: SortConfig,
      view: ViewMode,
      instant?: boolean
    ) => {
      const filtered = getFilteredBookmarks(
        bookmarks,
        folder,
        search,
        facetType,
        facetValue,
        sort,
        view
      );

      const doRefresh = () => {
        setDisplayBookmarks(filtered);
        resetViewportAndRebuild(filtered, view);
      };

      if (instant) {
        doRefresh();
        return;
      }

      doRefresh();
    },
    [resetViewportAndRebuild]
  );

  const rebuildFeedForCurrentViewport = useCallback(() => {
    const engine = engineRef.current;
    const viewport = viewportRef.current;
    const previousScrollTop = viewport?.scrollTop ?? 0;

    engine.config.POOL_SIZE = isLowSpecDevice() ? 260 : 420;
    engine.config.BUFFER = isLowSpecDevice() ? 320 : 600;
    const viewportWidth = getViewportWidth();
    engine.config.MEDIA_COLS = viewportWidth < 720 ? 2 : viewportWidth < 1100 ? 3 : 5;
    engine.config.CARD_COLS = viewportWidth < 720 ? 1 : viewportWidth < 1200 ? 3 : 4;

    createPool();
    refreshDisplay(
      allBookmarks,
      activeFolder,
      activeSearch,
      activeFacetType,
      activeFacetValue,
      activeSort,
      activeView,
      true
    );

    requestAnimationFrame(() => {
      const nextViewport = viewportRef.current;
      if (!nextViewport || !isVerticalFeedView(activeView)) return;
      const maxScrollTop = Math.max(0, nextViewport.scrollHeight - nextViewport.clientHeight);
      const nextScrollTop = clamp(previousScrollTop, 0, maxScrollTop);
      nextViewport.scrollTop = nextScrollTop;
      engine.feedScrollY = nextScrollTop;
      engine.cameraOffset.y = nextScrollTop;
      engine.targetOffset.y = nextScrollTop;
      renderVisibleItems();
      updateScrubberMarkerStyles();
    });
  }, [
    activeFacetType,
    activeFacetValue,
    activeFolder,
    activeSearch,
    activeSort,
    activeView,
    allBookmarks,
    createPool,
    refreshDisplay,
    renderVisibleItems,
    updateScrubberMarkerStyles,
  ]);

  const openLightbox = useCallback(
    (element: HTMLDivElement, bookmark: Bookmark) => {
      const engine = engineRef.current;
      const overlay = overlayRef.current;
      const lightboxInfo = lightboxInfoRef.current;
      if (engine.lightboxOpen || engine.lightboxAnimating) return;

      if (!bookmark.images || bookmark.images.length === 0) {
        window.open(bookmark.url, "_blank");
        return;
      }

      engine.lightboxAnimating = true;
      engine.lightboxOpen = true;
      engine.lightboxItem = { element, bookmark };
      setLightboxOpen(true);

      const rect = element.getBoundingClientRect();
      const media = bookmark.images[0];
      const { width: viewportWidth, height: viewportHeight } = getViewportSize();
      const targetFrame = getLightboxTargetFrame(media, viewportWidth, viewportHeight);

      const startX = rect.left;
      const startY = rect.top;
      const startWidth = rect.width;
      const startHeight = rect.height;
      const endX = targetFrame.x;
      const endY = targetFrame.y;
      const targetWidth = targetFrame.width;
      const targetHeight = targetFrame.height;
      const startScaleX = startWidth / targetWidth;
      const startScaleY = startHeight / targetHeight;

      element.style.visibility = "hidden";

      if (engine.lightboxClone && engine.lightboxClone.parentNode) {
        engine.lightboxClone.remove();
        engine.lightboxClone = null;
      }

      const clone = element.cloneNode(true) as HTMLDivElement;
      clone.querySelectorAll<HTMLElement>("*").forEach((child) => {
        child.style.transition = "none";
      });
      const clonedBody = clone.querySelector(".grid-item-body");
      clonedBody?.remove();
      const clonedMedia = clone.querySelector<HTMLElement>(".grid-item-media");
      if (clonedMedia) {
        clonedMedia.style.height = "100%";
        clonedMedia.style.background = "#0f0f10";
      }
      const clonedImage = clone.querySelector<HTMLImageElement>("img:not(.play-pill-icon)");
      if (clonedImage) {
        clonedImage.style.objectFit = "contain";
        clonedImage.style.background = "#0f0f10";
      }
      clone.classList.add("lightbox-active");
      clone.style.width = `${targetWidth}px`;
      clone.style.height = `${targetHeight}px`;
      clone.style.display = "";
      clone.style.visibility = "visible";
      clone.style.zIndex = "40001";
      clone.style.borderRadius = "24px";
      clone.style.background = "#0f0f10";
      clone.style.transition = "none";
      clone.style.transformOrigin = "top left";
      clone.style.transform = `translate3d(${startX}px, ${startY}px, 0) scale(${startScaleX}, ${startScaleY})`;

      const hiRes = new Image();
      hiRes.src = twitterImageUrl(bookmark.images[0].url, "4096x4096");
      hiRes.alt = "";
      hiRes.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;border-radius:inherit;background:#0f0f10;opacity:0;transition:opacity 0.12s ease;pointer-events:none;";
      hiRes.onload = () => {
        hiRes.style.opacity = "1";
      };
      hiRes.onerror = () => hiRes.remove();
      clone.appendChild(hiRes);

      if (bookmark.images[0].type === "video" || bookmark.images[0].type === "animated_gif") {
        const playButton = document.createElement("button");
        playButton.className = "lightbox-play-btn";
        playButton.innerHTML = `<span class="play-pill"><svg class="play-pill-icon" viewBox="0 0 24 24" fill="none" width="24" height="24"><path d="M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"/></svg><span>Play on Twitter</span></span>`;
        playButton.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;z-index:2;pointer-events:auto;";
        playButton.addEventListener("click", (event) => {
          event.stopPropagation();
          window.open(bookmark.url, "_blank");
        }, { once: true });
        clone.appendChild(playButton);
      }

      document.body.style.overflow = "hidden";
      document.body.appendChild(clone);
      engine.lightboxClone = clone;
      void clone.offsetHeight;

      overlay?.classList.add("active");

      setLightboxTitle(
        bookmark.text.length > 120 ? `${bookmark.text.substring(0, 120)}…` : bookmark.text
      );
      setLightboxLinkHref(bookmark.url);
      setLightboxLinkText(`@${bookmark.authorHandle}`);
      setLightboxMeta(getTimelineText(bookmark));

      if (lightboxInfo) {
        lightboxInfo.style.top = `${targetFrame.infoTop}px`;
      }

      engine.lightboxItem._startX = startX;
      engine.lightboxItem._startY = startY;
      engine.lightboxItem._startW = startWidth;
      engine.lightboxItem._startH = startHeight;
      engine.lightboxItem._endX = endX;
      engine.lightboxItem._endY = endY;
      engine.lightboxItem._endW = targetWidth;
      engine.lightboxItem._endH = targetHeight;

      requestAnimationFrame(() => {
        animate(
          clone,
          {
            transform: [
              `translate3d(${startX}px, ${startY}px, 0) scale(${startScaleX}, ${startScaleY})`,
              `translate3d(${endX}px, ${endY}px, 0) scale(1, 1)`,
            ],
          },
          { duration: 0.36, ease: [0.22, 1, 0.36, 1] }
        ).then(() => {
          requestAnimationFrame(() => {
            clone.style.width = `${targetWidth}px`;
            clone.style.height = `${targetHeight}px`;
            clone.style.transform = `translate3d(${endX}px, ${endY}px, 0) scale(1, 1)`;
            engine.lightboxAnimating = false;
          });
        });

        setTimeout(() => {
          clone.querySelector(".play-pill")?.classList.add("visible");
        }, 200);
      });
    },
    []
  );

  const updateOpenLightboxFrame = useCallback((animateFrame = true) => {
    const engine = engineRef.current;
    const lightboxItem = engine.lightboxItem;
    const clone = engine.lightboxClone;
    const lightboxInfo = lightboxInfoRef.current;

    if (!engine.lightboxOpen || !lightboxItem || !clone) return;
    const media = lightboxItem.bookmark.images?.[0];
    if (!media) return;

    const { width: viewportWidth, height: viewportHeight } = getViewportSize();
    const frame = getLightboxTargetFrame(media, viewportWidth, viewportHeight);
    const nextTransform = `translate3d(${frame.x}px, ${frame.y}px, 0) scale(1, 1)`;

    lightboxItem._endX = frame.x;
    lightboxItem._endY = frame.y;
    lightboxItem._endW = frame.width;
    lightboxItem._endH = frame.height;

    if (lightboxInfo) {
      lightboxInfo.style.top = `${frame.infoTop}px`;
    }

    clone.style.transition = "none";
    clone.style.transformOrigin = "top left";

    if (lightboxItem.resizeAnimation) {
      lightboxItem.resizeAnimation.stop();
      lightboxItem.resizeAnimation = undefined;
    }

    if (!animateFrame || engine.lightboxAnimating) {
      clone.style.width = `${frame.width}px`;
      clone.style.height = `${frame.height}px`;
      clone.style.transform = nextTransform;
      return;
    }

    const animation = animate(
      clone,
      {
        width: `${frame.width}px`,
        height: `${frame.height}px`,
        transform: nextTransform,
      },
      { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
    );
    lightboxItem.resizeAnimation = animation;
    animation.then(() => {
      if (lightboxItem.resizeAnimation === animation) {
        lightboxItem.resizeAnimation = undefined;
      }
    });
  }, []);

  const closeLightbox = useCallback(() => {
    const engine = engineRef.current;
    const overlay = overlayRef.current;
    if (!engine.lightboxOpen || engine.lightboxAnimating || !engine.lightboxItem) return;

    engine.lightboxAnimating = true;
    const { element } = engine.lightboxItem;
    const clone = engine.lightboxClone;

    engine.lightboxItem.resizeAnimation?.stop();
    engine.lightboxItem.resizeAnimation = undefined;
    clone?.querySelector(".play-pill")?.classList.remove("visible");
    overlay?.classList.remove("active");
    setLightboxOpen(false);

    const originalRect = element.getBoundingClientRect();
    const endX = originalRect.left;
    const endY = originalRect.top;
    const endWidth = originalRect.width;
    const endHeight = originalRect.height;
    const fromX = engine.lightboxItem._endX ?? endX;
    const fromY = engine.lightboxItem._endY ?? endY;
    const fromWidth = engine.lightboxItem._endW ?? endWidth;
    const fromHeight = engine.lightboxItem._endH ?? endHeight;
    const endScaleX = fromWidth ? endWidth / fromWidth : 1;
    const endScaleY = fromHeight ? endHeight / fromHeight : 1;

    if (!clone) {
      document.body.style.overflow = "";
      element.style.visibility = "";
      engine.lightboxOpen = false;
      engine.lightboxItem = null;
      engine.lightboxAnimating = false;
      return;
    }

    clone.style.width = `${fromWidth}px`;
    clone.style.height = `${fromHeight}px`;
    clone.style.transformOrigin = "top left";
    clone.style.transition = "none";
    clone.style.transform = `translate3d(${fromX}px, ${fromY}px, 0) scale(1, 1)`;

    animate(
      clone,
      {
        transform: [
          `translate3d(${fromX}px, ${fromY}px, 0) scale(1, 1)`,
          `translate3d(${endX}px, ${endY}px, 0) scale(${endScaleX}, ${endScaleY})`,
        ],
      },
      { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
    ).then(() => {
      clone.remove();
      document.body.style.overflow = "";
      engine.lightboxClone = null;
      element.style.visibility = "";
      engine.lightboxOpen = false;
      engine.lightboxItem = null;
      engine.lightboxAnimating = false;

      if (engine.needsPostLightboxRelayout) {
        engine.needsPostLightboxRelayout = false;
        rebuildFeedForCurrentViewport();
      }
    });
  }, [rebuildFeedForCurrentViewport]);

  const reloadBookmarks = useCallback(async () => {
    const response = await apiFetch(`/api/bookmarks?ts=${Date.now()}`);
    const data = await response.json();
    const nextBookmarks: Bookmark[] = Array.isArray(data) ? data : data.bookmarks || [];
    const nextFolders: BookmarkFolder[] = Array.isArray(data) ? [] : data.folders || [];
    setAllBookmarks(nextBookmarks);
    setFolders(nextFolders);
    refreshDisplay(
      nextBookmarks,
      activeFolder,
      activeSearch,
      activeFacetType,
      activeFacetValue,
      activeSort,
      activeView
    );
  }, [
    activeFacetType,
    activeFacetValue,
    activeFolder,
    activeSearch,
    activeSort,
    activeView,
    refreshDisplay,
  ]);

  const loadServerStatus = useCallback(async () => {
    try {
      const response = await apiFetch("/api/status");
      if (!response.ok) return;
      const payload = await response.json();
      if (typeof payload.bookmarkCount === "number") {
        setSyncStatusText(
          payload.running
            ? payload.message || "Working…"
            : payload.lastSyncedAt
              ? `Last sync ${formatDate(payload.lastSyncedAt)}`
              : "Local cache ready"
        );
        setSyncStatusTone(payload.running ? "working" : "idle");
      }
    } catch (e) {
      console.warn("Failed to poll sync status", e);
    }
  }, []);

  const runServerAction = useCallback(
    async (endpoint: string, pendingLabel: string, successLabel: string, isSync: boolean) => {
      setSyncStatusText(pendingLabel);
      setSyncStatusTone("working");
      if (isSync) setSyncBusy(true);
      else setReindexBusy(true);

      try {
        const response = await apiFetch(endpoint, { method: "POST" });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Action failed");
        }
        await reloadBookmarks();
        setSyncStatusText(
          payload.warning ? `${successLabel} • folder refresh needs review` : successLabel
        );
        setSyncStatusTone(payload.warning ? "working" : "success");
      } catch (error) {
        setSyncStatusText(error instanceof Error ? error.message : "Action failed");
        setSyncStatusTone("error");
      } finally {
        if (isSync) setSyncBusy(false);
        else setReindexBusy(false);
      }
    },
    [reloadBookmarks]
  );

  const applyFilter = useCallback(
    (folder: string) => {
      if (folder === activeFolder) return;
      viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      setActiveFolder(folder);
      refreshDisplay(
        allBookmarks,
        folder,
        activeSearch,
        activeFacetType,
        activeFacetValue,
        activeSort,
        activeView
      );
    },
    [
      activeFacetType,
      activeFacetValue,
      activeFolder,
      activeSearch,
      activeSort,
      activeView,
      allBookmarks,
      refreshDisplay,
    ]
  );

  const applyView = useCallback(
    (view: ViewMode) => {
      if (view === activeView) return;
      viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      setActiveView(view);
      refreshDisplay(
        allBookmarks,
        activeFolder,
        activeSearch,
        activeFacetType,
        activeFacetValue,
        activeSort,
        view
      );
    },
    [
      activeFacetType,
      activeFacetValue,
      activeFolder,
      activeSearch,
      activeSort,
      activeView,
      allBookmarks,
      refreshDisplay,
    ]
  );

  const applyFacet = useCallback(
    (type: FacetType, value: string) => {
      if (activeFacetType === type && activeFacetValue === value) return;
      setActiveFacetType(type);
      setActiveFacetValue(value);
      viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      refreshDisplay(
        allBookmarks,
        activeFolder,
        activeSearch,
        type,
        value,
        activeSort,
        activeView
      );
    },
    [
      activeFacetType,
      activeFacetValue,
      activeFolder,
      activeSearch,
      activeSort,
      activeView,
      allBookmarks,
      refreshDisplay,
    ]
  );

  useEffect(() => {
    saveState();
  }, [saveState]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const restored = JSON.parse(raw) as PersistedState;
          if (restored.darkMode) setDarkMode(true);
          if (restored.activeFolder) setActiveFolder(restored.activeFolder);
          if (restored.activeView) setActiveView(restored.activeView);
          if (restored.activeSort) {
            const rawSort = restored.activeSort;
            setActiveSort(
              Array.isArray(rawSort)
                ? rawSort
                : rawSort === "oldest"
                ? [{ field: "postedAt", direction: "asc" }]
                : rawSort === "liked"
                ? [{ field: "likeCount", direction: "desc" }]
                : DEFAULT_SORT
            );
          }
          if (restored.activeSearch) setActiveSearch(restored.activeSearch);
          if (restored.activeFacetType) setActiveFacetType(restored.activeFacetType);
          if (restored.activeFacetValue) setActiveFacetValue(restored.activeFacetValue);
          engineRef.current.feedScrollY = 0;
          if (restored.feedScrollY) {
            delete restored.feedScrollY;
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(restored)); } catch {}
          }
        }

        const response = await apiFetch("/api/bookmarks");
        const data = await response.json();
        if (cancelled) return;

        const nextBookmarks: Bookmark[] = Array.isArray(data) ? data : data.bookmarks || [];
        const nextFolders: BookmarkFolder[] = Array.isArray(data) ? [] : data.folders || [];
        setAllBookmarks(nextBookmarks);
        setFolders(nextFolders);

        const engine = engineRef.current;
        const viewportWidth = getViewportWidth();
        engine.config.MEDIA_COLS = viewportWidth < 720 ? 2 : viewportWidth < 1100 ? 3 : 5;
        engine.config.CARD_COLS = viewportWidth < 720 ? 1 : viewportWidth < 1200 ? 3 : 4;

        const folder =
          raw && JSON.parse(raw).activeFolder ? JSON.parse(raw).activeFolder : "All";
        const view =
          raw && JSON.parse(raw).activeView ? JSON.parse(raw).activeView : "media";
        const sortRaw =
          raw && JSON.parse(raw).activeSort;
        const sort: SortConfig = Array.isArray(sortRaw)
          ? sortRaw
          : sortRaw === "oldest"
          ? [{ field: "postedAt", direction: "asc" }]
          : sortRaw === "liked"
          ? [{ field: "likeCount", direction: "desc" }]
          : DEFAULT_SORT;
        const search =
          raw && JSON.parse(raw).activeSearch ? JSON.parse(raw).activeSearch : "";
        const facetType =
          raw && JSON.parse(raw).activeFacetType
            ? JSON.parse(raw).activeFacetType
            : "all";
        const facetValue =
          raw && JSON.parse(raw).activeFacetValue
            ? JSON.parse(raw).activeFacetValue
            : "All bookmarks";

        const filtered = getFilteredBookmarks(
          nextBookmarks,
          folder,
          search,
          facetType,
          facetValue,
          sort,
          view
        );
        setDisplayBookmarks(filtered);
        createPool();
        resetViewportAndRebuild(filtered, view);

        const restoredScroll = engineRef.current.feedScrollY;
        if (restoredScroll > 0 && isVerticalFeedView(view)) {
          const vp = viewportRef.current;
          if (vp) {
            vp.scrollTop = restoredScroll;
            engineRef.current.cameraOffset.y = restoredScroll;
            engineRef.current.targetOffset.y = restoredScroll;
          }
        }

        loadServerStatus();
        setLoaded(true);

        const warmup = document.createElement("div");
        warmup.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
        document.body.appendChild(warmup);
        animate(warmup, { opacity: [0, 1] }, { duration: 0.01 }).then(() => warmup.remove());
      } catch (error) {
        console.error("Failed to load bookmarks data:", error);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [createPool, loadServerStatus, resetViewportAndRebuild]);

  // Multi-browser sync via BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel("kairos-sync");
    syncChannelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data === "sync-complete") {
        reloadBookmarks();
      }
    };
    return () => {
      channel.close();
    };
  }, [reloadBookmarks]);

  useEffect(() => {
    if (!loaded) return;

    const viewport = viewportRef.current;
    const engine = engineRef.current;
    if (!viewport) return;

    let syncFeedScrollRaf: number | null = null;
    const syncFeedScrollState = () => {
      if (!isVerticalFeedView(activeView)) return;
      engine.feedScrollY = viewport.scrollTop;
      engine.cameraOffset.x = 0;
      engine.targetOffset.x = 0;
      engine.cameraOffset.y = engine.feedScrollY;
      engine.targetOffset.y = engine.feedScrollY;
      updateScrubberMarkerStyles();
      requestRender();
      if (syncFeedScrollRaf === null) {
        syncFeedScrollRaf = requestAnimationFrame(() => {
          syncFeedScrollRaf = null;
        });
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      if (isVerticalFeedView(activeView)) return;
      if (engine.lightboxOpen) return;
      engine.isDragging = true;
      engine.hasDragged = false;
      engine.dragStartPosition = { x: event.clientX, y: event.clientY };
      viewport.classList.add("grabbing");
      engine.previousMousePosition = { x: event.clientX, y: event.clientY };
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!engine.isDragging) return;
      const totalDx = event.clientX - engine.dragStartPosition.x;
      const totalDy = event.clientY - engine.dragStartPosition.y;
      if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > DRAG_THRESHOLD) {
        engine.hasDragged = true;
      }
      const deltaX = event.clientX - engine.previousMousePosition.x;
      const deltaY = event.clientY - engine.previousMousePosition.y;
      engine.targetOffset.x -= deltaX;
      engine.targetOffset.y -= deltaY;
      engine.previousMousePosition = { x: event.clientX, y: event.clientY };
    };

    const onMouseUp = (event: MouseEvent) => {
      const wasDragging = engine.isDragging;
      engine.isDragging = false;
      viewport.classList.remove("grabbing");
      if (wasDragging && !engine.hasDragged && !engine.lightboxOpen) {
        const target = (event.target as HTMLElement).closest(".grid-item") as HTMLDivElement;
        if (target) {
          const bookmark = engine.elToBookmark.get(target);
          if (bookmark) openLightbox(target, bookmark);
        }
      }
    };

    const onViewportClick = (event: MouseEvent) => {
      if (!isVerticalFeedView(activeView) || engine.lightboxOpen) return;
      const target = (event.target as HTMLElement).closest(".grid-item") as HTMLDivElement;
      if (!target) return;
      const bookmark = engine.elToBookmark.get(target);
      if (bookmark) openLightbox(target, bookmark);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (isVerticalFeedView(activeView)) return;
      if (event.touches.length === 1) {
        engine.touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1 && engine.touchStart) {
        event.preventDefault();
        const deltaX = event.touches[0].clientX - engine.touchStart.x;
        const deltaY = event.touches[0].clientY - engine.touchStart.y;
        engine.targetOffset.x -= deltaX;
        engine.targetOffset.y -= deltaY;
        engine.touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }
    };

    const onTouchEnd = () => {
      engine.touchStart = null;
    };

    const onWheel = (event: WheelEvent) => {
      if (engine.lightboxOpen) return;
      if (isVerticalFeedView(activeView)) return;
      event.preventDefault();
      engine.targetOffset.y += event.deltaY;
      engine.targetOffset.x = 0;
      engine.targetOffset.y = clamp(
        engine.targetOffset.y,
        engine.contentBounds.minY,
        engine.contentBounds.maxY
      );
      engine.cameraOffset.x = 0;
      engine.cameraOffset.y = engine.targetOffset.y;
      renderVisibleItems();
    };

    const onWindowResize = () => {
      if (engine.lightboxOpen) {
        engine.needsPostLightboxRelayout = true;
        updateOpenLightboxFrame(true);
        return;
      }

      const previousScrollTop = viewport?.scrollTop ?? 0;

      engine.config.POOL_SIZE = isLowSpecDevice() ? 260 : 420;
      engine.config.BUFFER = isLowSpecDevice() ? 320 : 600;
      const viewportWidth = getViewportWidth();
      engine.config.MEDIA_COLS = viewportWidth < 720 ? 2 : viewportWidth < 1100 ? 3 : 5;
      engine.config.CARD_COLS = viewportWidth < 720 ? 1 : viewportWidth < 1200 ? 3 : 4;
      resetViewportAndRebuild(displayBookmarks, activeView);

      requestAnimationFrame(() => {
        const nextViewport = viewportRef.current;
        if (!nextViewport || !isVerticalFeedView(activeView)) return;
        const maxScrollTop = Math.max(0, nextViewport.scrollHeight - nextViewport.clientHeight);
        const nextScrollTop = Math.min(previousScrollTop, maxScrollTop);
        nextViewport.scrollTop = nextScrollTop;
        engine.feedScrollY = nextScrollTop;
        engine.cameraOffset.y = nextScrollTop;
        engine.targetOffset.y = nextScrollTop;
        renderVisibleItems();
        updateScrubberMarkerStyles();
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && engine.lightboxOpen) closeLightbox();
    };

    const onViewportKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = (event.target as HTMLElement).closest(".grid-item") as HTMLDivElement;
      if (!target || engine.lightboxOpen) return;
      event.preventDefault();
      const bookmark = engine.elToBookmark.get(target);
      if (bookmark) openLightbox(target, bookmark);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (engine.scrubberIsDragging) return;
      const rect = viewport.getBoundingClientRect();
      const insideViewport =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      const withinActivationZone = rect.right - event.clientX <= 76;

      if (insideViewport && isVerticalFeedView(activeView) && engine.scrubberData.length > 1) {
        if (withinActivationZone) {
          setScrubberActive(true);
          const rail = scrubberRailRef.current;
          if (rail) {
            const railRect = rail.getBoundingClientRect();
            engine.scrubberPointerProgress = clamp(
              (event.clientY - railRect.top) / railRect.height,
              0,
              1
            );
            const hoverIndex = findClosestScrubberIndexByProgress(engine.scrubberPointerProgress);
            updateScrubberMarkerStyles();
            if (hoverIndex >= 0) showScrubberPreview(hoverIndex);
          }
        } else {
          setScrubberActive(false);
          engine.scrubberPointerProgress = null;
          hideScrubberPreview();
          updateScrubberMarkerStyles();
        }
      } else if (!insideViewport && !engine.scrubberIsDragging) {
        setScrubberActive(false);
        engine.scrubberPointerProgress = null;
        hideScrubberPreview();
        updateScrubberMarkerStyles();
      }
    };

    let animationFrame = 0;
    const animateLoop = () => {
      if (!isVerticalFeedView(activeView)) {
        const deltaX = engine.targetOffset.x - engine.cameraOffset.x;
        const deltaY = engine.targetOffset.y - engine.cameraOffset.y;
        if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
          engine.cameraOffset.x += deltaX * engine.config.easingFactor;
          engine.cameraOffset.y += deltaY * engine.config.easingFactor;
          renderVisibleItems();
        }
      }
      animationFrame = requestAnimationFrame(animateLoop);
    };
    animationFrame = requestAnimationFrame(animateLoop);

    viewport.addEventListener("mousedown", onMouseDown);
    viewport.addEventListener("mousemove", onMouseMove);
    viewport.addEventListener("mouseup", onMouseUp);
    viewport.addEventListener("mouseleave", onMouseUp);
    viewport.addEventListener("click", onViewportClick);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("scroll", syncFeedScrollState, { passive: true });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("keydown", onViewportKeyDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(animationFrame);
      viewport.removeEventListener("mousedown", onMouseDown);
      viewport.removeEventListener("mousemove", onMouseMove);
      viewport.removeEventListener("mouseup", onMouseUp);
      viewport.removeEventListener("mouseleave", onMouseUp);
      viewport.removeEventListener("click", onViewportClick);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("scroll", syncFeedScrollState);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("keydown", onViewportKeyDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("keydown", onKeyDown);
      if (syncFeedScrollRaf !== null) cancelAnimationFrame(syncFeedScrollRaf);
    };
  }, [
    activeFacetType,
    activeFacetValue,
    activeFolder,
    activeSearch,
    activeSort,
    activeView,
    allBookmarks,
    closeLightbox,
    displayBookmarks,
    hideScrubberPreview,
    loaded,
    openLightbox,
    renderVisibleItems,
    resetViewportAndRebuild,
    requestRender,
    showScrubberPreview,
    updateOpenLightboxFrame,
    updateScrubberMarkerStyles,
  ]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const onVisualViewportResize = () => {
      updateOpenLightboxFrame(true);
    };

    visualViewport.addEventListener("resize", onVisualViewportResize);
    return () => {
      visualViewport.removeEventListener("resize", onVisualViewportResize);
    };
  }, [updateOpenLightboxFrame]);

  useLayoutEffect(() => {
    const feedShell = feedShellRef.current;
    const viewport = viewportRef.current;
    if (!feedShell || !viewport) return;

    const updateScrubberFrame = () => {
      const shellRect = feedShell.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const inset = 18;
      const nextTop = Math.max(0, viewportRect.top - shellRect.top + inset);
      const nextHeight = Math.max(0, viewportRect.height - inset * 2);

      setScrubberFrame((previous) => {
        if (
          Math.abs(previous.top - nextTop) < 1 &&
          Math.abs(previous.height - nextHeight) < 1
        ) {
          return previous;
        }

        return { top: nextTop, height: nextHeight };
      });
    };

    updateScrubberFrame();

    const resizeObserver = new ResizeObserver(() => {
      updateScrubberFrame();
    });

    resizeObserver.observe(feedShell);
    resizeObserver.observe(viewport);
    window.addEventListener("resize", updateScrubberFrame);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrubberFrame);
    };
  }, [activeView, loaded]);

  const folderOptions = ["All", ...folders.map((folder) => folder.name)];
  const categoryCounts = new Map<string, number>();
  for (const b of allBookmarks) {
    const cat = b.category || "unclassified";
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }
  const resultsNoun = displayBookmarks.length === 1 ? "bookmark" : "bookmarks";
  const folderLabel = activeFolder === "All" ? "All folders" : activeFolder;
  const facetLabel =
    activeFacetType === "all" ? folderLabel : `${folderLabel} • ${activeFacetValue}`;
  const searchLabel = activeSearch.trim()
    ? `Matching "${activeSearch.trim()}"`
    : "Showing all items";

  const scrollToScrubberProgress = (progress: number, behavior: ScrollBehavior = "auto") => {
    const engine = engineRef.current;
    const viewport = viewportRef.current;
    if (!viewport || !engine.scrubberYPositions?.length) return;
    const idx = Math.floor(clamp(progress, 0, 0.9999) * engine.scrubberYPositions.length);
    viewport.scrollTo({ top: engine.scrubberYPositions[idx], behavior });
  };

  const jumpToScrubberMarker = (index: number) => {
    const engine = engineRef.current;
    const bookmarksInWeek = engine.weekBookmarks?.[index];
    if (!bookmarksInWeek || bookmarksInWeek.length === 0) return;
    const firstBm = bookmarksInWeek[0];
    const item = engine.layoutItems.find((li) => li.bookmark.id === firstBm.id);
    if (!item) return;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ top: item.y, behavior: "smooth" });
    showScrubberPreview(index);
  };

  const jumpToDayScrubberMarker = (dayIndex: number) => {
    const engine = engineRef.current;
    const bookmarksInDay = engine.dayBookmarks?.[dayIndex];
    if (!bookmarksInDay || bookmarksInDay.length === 0) return;
    const firstBm = bookmarksInDay[0];
    const item = engine.layoutItems.find((li) => li.bookmark.id === firstBm.id);
    if (!item) return;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ top: item.y, behavior: "smooth" });
  };

  const scrollToBookmark = useCallback((bookmarkId: string) => {
    const engine = engineRef.current;
    const item = engine.layoutItems.find((li) => li.bookmark.id === bookmarkId);
    if (!item) return;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ top: item.y, behavior: "smooth" });
  }, []);

  const setScrubberDragging = (dragging: boolean) => {
    engineRef.current.scrubberIsDragging = dragging;
  };

  return {
    refs: {
      feedShellRef,
      viewportRef,
      containerRef,
      gridRef,
      overlayRef,
      lightboxInfoRef,
      scrubberRef,
      scrubberRailRef,
      scrubberMarkersRef,
      scrubberPreviewRef,
      scrubberThumbRef,
    },
    state: {
      allBookmarks,
      displayBookmarks,
      activeFolder,
      activeView,
      activeSort,
      activeSearch,
      activeFacetType,
      activeFacetValue,
      darkMode,
      syncStatusText,
      syncStatusTone,
      syncBusy,
      reindexBusy,
      scrubberVisible,
      scrubberActive,
      scrubberMarkers,
      scrubberAnchors,
      scrubberDayAnchors,
      scrubberFrame,
      scrubberPreviewHtml,
      scrubberPreviewTop,
      scrubberPreviewVisible,
      lightboxOpen,
      lightboxTitle,
      lightboxLinkHref,
      lightboxLinkText,
      lightboxMeta,
      containerHeight,
      gridWidth,
      gridHeight,
      feedMode,
      loaded,
      folderOptions,
      resultsNoun,
      facetLabel,
      searchLabel,
    },
    actions: {
      setActiveSearch: (value: string, instant?: boolean) => {
        setActiveSearch(value);
        refreshDisplay(
          allBookmarks,
          activeFolder,
          value,
          activeFacetType,
          activeFacetValue,
          activeSort,
          activeView,
          instant
        );
      },
      clearSearch: () => {
        setActiveSearch("");
        refreshDisplay(
          allBookmarks,
          activeFolder,
          "",
          activeFacetType,
          activeFacetValue,
          activeSort,
          activeView
        );
      },
      setDarkMode: (value: boolean) => {
        setDarkMode(value);
        document.body.classList.add("theme-transition");
        setTimeout(() => document.body.classList.remove("theme-transition"), 400);
      },
      applyFilter,
      applyView,
      applyFacet,
      closeLightbox,
      runServerAction,
      jumpToScrubberMarker,
      jumpToDayScrubberMarker,
      scrollToBookmark,
      showScrubberPreview,
      updateScrubberMarkerStyles,
      setScrubberActive,
      setScrubberDragging,
      scrollToScrubberProgress,
      setActiveSort: (sort: SortConfig) => {
        setActiveSort(sort);
        refreshDisplay(
          allBookmarks,
          activeFolder,
          activeSearch,
          activeFacetType,
          activeFacetValue,
          sort,
          activeView
        );
      },
    },
    helpers: {
      iconPath,
      sortIcons,
      getSortLabel,
      escapeHtml,
    },
  };
}
