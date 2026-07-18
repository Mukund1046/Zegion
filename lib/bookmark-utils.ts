import type { Bookmark, FacetType, SortMode, ViewMode } from "./types";

export const STORAGE_KEY = "kairos_state";

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value?: string | null) => {
  const date = parseDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

export const escapeHtml = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const lineClampText = (value = "", maxLength = 180) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

export const formatCount = (value = 0) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${value}`;
};

export const getBookmarkDomain = (bookmark: Bookmark) => {
  try {
    return new URL(bookmark.url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
};

export const getBookmarkMediaKind = (bookmark: Bookmark) => {
  const media = bookmark.images?.[0];
  if (!media) return "Text";
  if (media.type === "video") return "Video";
  if (media.type === "animated_gif") return "GIF";
  return "Image";
};

export const getBookmarkCategory = (bookmark: Bookmark) =>
  bookmark.category || "unclassified";

export const getBookmarkAuthorsLabel = (bookmark: Bookmark) =>
  bookmark.authorName || `@${bookmark.authorHandle}` || "Unknown";

export const getTimelineEntries = (bookmark: Bookmark) => {
  const posted = formatDate(bookmark.postedAt);
  const saved = formatDate(bookmark.bookmarkedAt);
  const synced = formatDate(bookmark.syncedAt);

  const entries: { label: string; value: string }[] = [];
  if (posted) entries.push({ label: "Posted", value: posted });
  if (saved) entries.push({ label: "Saved", value: saved });
  else if (synced) entries.push({ label: "Synced", value: synced });
  return entries;
};

export const getTimelineText = (bookmark: Bookmark) =>
  getTimelineEntries(bookmark)
    .map((entry) => `${entry.label} ${entry.value}`)
    .join("  •  ");

export const estimateCardHeight = (bookmark: Bookmark, itemWidth: number) => {
  const hasImage = bookmark.images && bookmark.images.length > 0;
  const imageHeight = hasImage
    ? clamp(
        itemWidth / (bookmark.images[0].width / bookmark.images[0].height),
        140,
        240
      )
    : 0;
  const text = lineClampText(bookmark.text || "", 150);
  const charsPerLine = Math.max(24, Math.floor(itemWidth / 8.8));
  const textLines = clamp(Math.ceil(text.length / charsPerLine), 2, 5);
  const textHeight = textLines * 18;
  const timelineRows = getTimelineEntries(bookmark).length > 0 ? 1 : 0;
  const timelineHeight = timelineRows * 22;
  return imageHeight + textHeight + timelineHeight + 92;
};

export const twitterImageUrl = (url: string, size = "small") => {
  const base = url.split("?")[0];
  const ext = base.match(/\.(jpg|jpeg|png)$/i);
  const format = ext ? ext[1].toLowerCase() : "jpg";
  return `${base}?format=${format}&name=${size}`;
};

export const isLowSpecDevice = () => {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  return memory <= 4 || cores <= 4 || window.innerWidth < 900;
};

export const getSortLabel = (sortValue: SortMode) => {
  if (sortValue === "oldest") return "Oldest first";
  if (sortValue === "liked") return "Most liked";
  return "Most recent";
};

export const isVerticalFeedView = (activeView: ViewMode) =>
  activeView === "media" || activeView === "card";

export const buildFacetCounts = (
  items: Bookmark[],
  valueGetter: (item: Bookmark) => string | null | undefined
) => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = valueGetter(item);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
};

export const matchesActiveFacet = (
  bookmark: Bookmark,
  activeFacetType: FacetType,
  activeFacetValue: string
) => {
  if (activeFacetType === "all") return true;
  if (activeFacetType === "folder") {
    return (bookmark.folders || []).includes(activeFacetValue);
  }
  if (activeFacetType === "category") {
    return (bookmark.category || "unclassified") === activeFacetValue;
  }
  if (activeFacetType === "domain") {
    return getBookmarkDomain(bookmark) === activeFacetValue;
  }
  if (activeFacetType === "linkedDomain") {
    return (bookmark.linkedDomains || []).includes(activeFacetValue);
  }
  if (activeFacetType === "author") {
    return getBookmarkAuthorsLabel(bookmark) === activeFacetValue;
  }
  if (activeFacetType === "media") {
    return getBookmarkMediaKind(bookmark) === activeFacetValue;
  }
  return true;
};

export const getFilteredBookmarks = (
  allBookmarks: Bookmark[],
  activeFolder: string,
  activeSearch: string,
  activeFacetType: FacetType,
  activeFacetValue: string,
  activeSort: SortMode,
  activeView: ViewMode
) => {
  const folderFiltered =
    activeFolder === "All"
      ? allBookmarks
      : allBookmarks.filter(
          (bookmark) => bookmark.folders && bookmark.folders.includes(activeFolder)
        );

  const searchTerm = activeSearch.trim().toLowerCase();
  const searched = searchTerm
    ? folderFiltered.filter((bookmark) =>
        [
          bookmark.authorName,
          bookmark.authorHandle,
          bookmark.text,
          ...(bookmark.folders || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchTerm)
      )
    : folderFiltered;

  const faceted = searched.filter((bookmark) =>
    matchesActiveFacet(bookmark, activeFacetType, activeFacetValue)
  );

  const sorted = [...faceted].sort((a, b) => {
    if (activeSort === "liked") return (b.likeCount || 0) - (a.likeCount || 0);

    const leftDate = new Date(
      a.bookmarkedAt || a.syncedAt || a.postedAt || 0
    ).getTime();
    const rightDate = new Date(
      b.bookmarkedAt || b.syncedAt || b.postedAt || 0
    ).getTime();

    if (activeSort === "oldest") return leftDate - rightDate;
    return rightDate - leftDate;
  });

  if (activeView === "media") {
    return sorted.filter((bookmark) => bookmark.images && bookmark.images.length > 0);
  }

  return sorted;
};

export const getNavigatorDate = (bookmark: Bookmark) =>
  parseDate(bookmark.bookmarkedAt) ||
  parseDate(bookmark.syncedAt) ||
  parseDate(bookmark.postedAt);

export const formatNavigatorDate = (bookmark: Bookmark) => {
  const date = getNavigatorDate(bookmark);
  if (!date) return "Saved Bookmark";

  const daysDiff = Math.round(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff >= 0 && daysDiff <= 35) {
    if (daysDiff <= 1) return "Today";
    if (daysDiff < 7) return `${daysDiff} days ago`;
    return `${Math.max(1, Math.round(daysDiff / 7))} week ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
};

export const formatNavigatorSubline = (bookmark: Bookmark) => {
  const date = getNavigatorDate(bookmark);
  if (!date) return bookmark.authorHandle ? `@${bookmark.authorHandle}` : "Bookmark";

  const absolute = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

  return [bookmark.authorHandle ? `@${bookmark.authorHandle}` : null, absolute]
    .filter(Boolean)
    .join(" • ");
};

export interface LayoutItem {
  key: string;
  bookmark: Bookmark;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const buildMasonryLayout = (
  displayBookmarks: Bookmark[],
  activeView: ViewMode,
  viewportWidth: number,
  viewportHeight: number,
  mediaCols: number,
  cardCols: number,
  gap: number
) => {
  const columnsCount = activeView === "media" ? mediaCols : cardCols;
  const colWidth = Math.floor((viewportWidth - gap) / columnsCount);
  const totalWidth = colWidth * columnsCount;
  const colHeights = new Array(columnsCount).fill(0);
  const columns: LayoutItem[][] = Array.from({ length: columnsCount }, () => []);

  if (displayBookmarks.length === 0) {
    return {
      layoutItems: [] as LayoutItem[],
      colWidth,
      totalWidth,
      maxColHeight: viewportHeight,
      contentBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    };
  }

  for (const bookmark of displayBookmarks) {
    let minCol = 0;
    for (let columnIndex = 1; columnIndex < columnsCount; columnIndex += 1) {
      if (colHeights[columnIndex] < colHeights[minCol]) minCol = columnIndex;
    }

    const itemWidth = colWidth - gap;
    let itemHeight = itemWidth;

    if (activeView === "media") {
      const image = bookmark.images[0];
      const aspect = image.width / image.height;
      itemHeight = itemWidth / aspect;
    } else {
      itemHeight = estimateCardHeight(bookmark, itemWidth);
    }

    const x = minCol * colWidth + gap / 2;
    const y = colHeights[minCol] + gap / 2;

    columns[minCol].push({
      key: "",
      bookmark,
      x,
      y,
      w: itemWidth,
      h: itemHeight,
    });
    colHeights[minCol] += itemHeight + gap;
  }

  const maxColHeight = Math.max(...colHeights);
  const layoutItems: LayoutItem[] = [];
  for (let columnIndex = 0; columnIndex < columnsCount; columnIndex += 1) {
    for (let rowIndex = 0; rowIndex < columns[columnIndex].length; rowIndex += 1) {
      const item = columns[columnIndex][rowIndex];
      layoutItems.push({
        ...item,
        key: `${columnIndex}-${rowIndex}`,
      });
    }
  }

  return {
    layoutItems,
    colWidth,
    totalWidth,
    maxColHeight,
    contentBounds: {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: Math.max(0, maxColHeight - viewportHeight),
    },
  };
};
