export interface BookmarkImage {
  url: string;
  width: number;
  height: number;
  type: string;
  videoUrl?: string;
}

export interface Bookmark {
  id: string;
  text: string;
  url: string;
  authorHandle: string;
  authorName: string;
  authorAvatar: string;
  postedAt: string;
  bookmarkedAt: string;
  syncedAt: string;
  images: BookmarkImage[];
  mediaCount: number;
  likeCount: number;
  repostCount: number;
  bookmarkCount: number;
  category: string;
  categories: string[];
  domain: string | null;
  domains: string[];
  linkedDomains: string[];
  folders: string[];
}

export interface BookmarkFolder {
  name: string;
  id?: string;
}

export interface BookmarksPayload {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
}

export type ViewMode = "media" | "card";
export type SortMode = "recent" | "oldest" | "liked";
export type FacetType =
  | "all"
  | "folder"
  | "category"
  | "domain"
  | "linkedDomain"
  | "author"
  | "media";

export interface PersistedState {
  darkMode?: boolean;
  activeFolder?: string;
  activeView?: ViewMode;
  activeSort?: SortMode;
  activeSearch?: string;
  activeFacetType?: FacetType;
  activeFacetValue?: string;
  sidebarOpen?: boolean;
  sidebarSections?: Record<string, boolean>;
}

export interface StatusSnapshot {
  running: boolean;
  type: string | null;
  message: string;
  lastError: string | null;
  bookmarkCount: number;
  folderCount: number;
  dataDir: string;
  lastSyncedAt: string | null;
  cookieMode: string;
}
