export interface RecentSearchEntry {
  query: string;
  facetType: string;
  facetValue: string;
  at: number;
}

export declare const RECENT_SEARCH_KEY: string;
export declare const RECENT_SEARCH_LIMIT: number;
export declare function keyOf(entry: RecentSearchEntry): string;
export declare function isMeaningful(entry: Pick<RecentSearchEntry, "query" | "facetType" | "facetValue">): boolean;
export declare function recordRecentSearch(
  list: RecentSearchEntry[],
  entry: Pick<RecentSearchEntry, "query" | "facetType" | "facetValue"> & { at?: number },
  limit?: number
): RecentSearchEntry[];
export declare function removeRecentSearch(list: RecentSearchEntry[], key: string): RecentSearchEntry[];
export declare function clearRecentSearches(): RecentSearchEntry[];
export declare function sanitizeRecentSearches(raw: unknown): RecentSearchEntry[];
