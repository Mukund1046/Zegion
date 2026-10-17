/**
 * Recent-search history for the command palette.
 *
 * Pure, dependency-free list logic: every meaningful applied search or facet
 * is recorded, deduplicated (an identical query+facet moves back to the top),
 * and the list is bounded. Storage itself is handled by the viewer hook via
 * lib/bookmark-utils storageGet/storageSet under its own localStorage key —
 * deliberately separate from the umbrella kairos_state blob, which restores
 * the *active* filter, not history.
 *
 * "meaningful" = a non-empty text query or a real facet selection. Folder
 * navigation, generic resets, and empty entries are never recorded.
 */

const RECENT_SEARCH_KEY = "kairos-recent-searches";
const RECENT_SEARCH_LIMIT = 12;
const EXCLUDED_FACET_TYPES = new Set(["all", "folder", ""]);

function keyOf(entry) {
  const query = typeof entry.query === "string" ? entry.query.trim().toLowerCase() : "";
  const facetType = typeof entry.facetType === "string" ? entry.facetType : "all";
  const facetValue = typeof entry.facetValue === "string" ? entry.facetValue.trim().toLowerCase() : "";
  return `${query}|${facetType}|${facetValue}`;
}

function isMeaningful(entry) {
  const hasQuery = typeof entry.query === "string" && entry.query.trim().length > 0;
  const facetType = typeof entry.facetType === "string" ? entry.facetType : "all";
  const hasFacet = !EXCLUDED_FACET_TYPES.has(facetType) && typeof entry.facetValue === "string" && entry.facetValue.trim().length > 0;
  return hasQuery || hasFacet;
}

function recordRecentSearch(list, entry, limit = RECENT_SEARCH_LIMIT) {
  if (!Array.isArray(list)) return [];
  if (!isMeaningful(entry)) return list;
  const clean = {
    query: (typeof entry.query === "string" ? entry.query : "").trim(),
    facetType: typeof entry.facetType === "string" ? entry.facetType : "all",
    facetValue: (typeof entry.facetValue === "string" ? entry.facetValue : "").trim(),
  };
  if (!isMeaningful(clean)) return list;
  const key = keyOf(clean);
  const next = list.filter((item) => keyOf(item) !== key);
  next.unshift({ ...clean, at: entry.at ?? Date.now() });
  return next.slice(0, Math.max(1, limit));
}

function removeRecentSearch(list, key) {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => keyOf(item) !== key);
}

function clearRecentSearches() {
  return [];
}

function sanitizeRecentSearches(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const valid = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = {
      query: typeof item.query === "string" ? item.query.trim() : "",
      facetType: typeof item.facetType === "string" ? item.facetType : "all",
      facetValue: typeof item.facetValue === "string" ? item.facetValue.trim() : "",
      at: typeof item.at === "number" && Number.isFinite(item.at) ? item.at : 0,
    };
    if (!isMeaningful(entry)) continue;
    if (EXCLUDED_FACET_TYPES.has(entry.facetType) && !entry.query) continue;
    if (EXCLUDED_FACET_TYPES.has(entry.facetType) && entry.query) entry.facetType = "all";
    const key = keyOf(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(entry);
  }
  return valid.slice(0, RECENT_SEARCH_LIMIT);
}

module.exports = {
  RECENT_SEARCH_KEY,
  RECENT_SEARCH_LIMIT,
  keyOf,
  isMeaningful,
  recordRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  sanitizeRecentSearches,
};
