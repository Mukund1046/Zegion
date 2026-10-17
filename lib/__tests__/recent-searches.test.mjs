/** Recent-search history unit tests: record, dedupe, bound, remove, clear, sanitize. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RECENT_SEARCH_KEY,
  RECENT_SEARCH_LIMIT,
  keyOf,
  isMeaningful,
  recordRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  sanitizeRecentSearches,
} from "../recent-searches.js";

describe("recent-searches", () => {
  it("storage key is its own localStorage namespace", () => {
    assert.equal(RECENT_SEARCH_KEY, "kairos-recent-searches");
  });

  describe("isMeaningful", () => {
    it("counts a text query, rejects empty combos", () => {
      assert.equal(isMeaningful({ query: "elon musk", facetType: "all", facetValue: "" }), true);
      assert.equal(isMeaningful({ query: "", facetType: "all", facetValue: "" }), false);
      assert.equal(isMeaningful({ query: "   ", facetType: "all", facetValue: "" }), false);
    });

    it("counts a genuine facet, never folder navigation", () => {
      assert.equal(isMeaningful({ query: "", facetType: "author", facetValue: "Elon Musk" }), true);
      assert.equal(isMeaningful({ query: "", facetType: "domain", facetValue: "github.com" }), true);
      assert.equal(isMeaningful({ query: "", facetType: "all", facetValue: "All bookmarks" }), false);
      assert.equal(isMeaningful({ query: "", facetType: "folder", facetValue: "Tech" }), false);
      assert.equal(isMeaningful({ query: "", facetType: "", facetValue: "" }), false);
    });
  });

  describe("keyOf", () => {
    it("normalizes case and whitespace so dedupe is stable", () => {
      assert.equal(
        keyOf({ query: "  Elon Musk ", facetType: "author", facetValue: " Elon Musk ", at: 0 }),
        keyOf({ query: "elon musk", facetType: "author", facetValue: "elon musk", at: 0 })
      );
    });

    it("keeps same text under different facets distinct", () => {
      assert.notEqual(
        keyOf({ query: "core", facetType: "all", facetValue: "", at: 0 }),
        keyOf({ query: "core", facetType: "author", facetValue: "Elon Musk", at: 0 })
      );
    });
  });

  describe("recordRecentSearch", () => {
    it("dedupes identical searches, moves most recent to front, trims query", () => {
      let list = recordRecentSearch([], { query: "rust", facetType: "all", facetValue: "" });
      list = recordRecentSearch(list, { query: "core", facetType: "all", facetValue: "" });
      list = recordRecentSearch(list, { query: "  rust  ", facetType: "all", facetValue: "" });
      assert.equal(list.length, 2);
      assert.equal(list[0].query, "rust");
      assert.equal(list[1].query, "core");
    });

    it("records facet-only entries", () => {
      const list = recordRecentSearch([], { query: "", facetType: "domain", facetValue: "news.ycombinator.com" });
      assert.equal(list.length, 1);
      assert.equal(list[0].facetValue, "news.ycombinator.com");
    });

    it("ignores meaningless entries", () => {
      assert.deepEqual(recordRecentSearch([], { query: "", facetType: "all", facetValue: "All bookmarks" }), []);
      assert.deepEqual(recordRecentSearch([], { query: "", facetType: "folder", facetValue: "Tech" }), []);
    });

    it("bounds history to RECENT_SEARCH_LIMIT", () => {
      assert.ok(RECENT_SEARCH_LIMIT > 0);
      let list = [];
      for (let i = 0; i < RECENT_SEARCH_LIMIT + 8; i++) {
        list = recordRecentSearch(list, { query: `query-${i}`, facetType: "all", facetValue: "" });
      }
      assert.equal(list.length, RECENT_SEARCH_LIMIT);
      assert.equal(list[0].query, `query-${RECENT_SEARCH_LIMIT + 7}`);
    });

    it("carries a timestamp field", () => {
      const list = recordRecentSearch([], { query: "core", facetType: "all", facetValue: "", at: 1234 });
      assert.equal(list[0].at, 1234);
    });
  });

  describe("removeRecentSearch", () => {
    it("removes only the matching entry", () => {
      let list = recordRecentSearch([], { query: "a", facetType: "all", facetValue: "" });
      list = recordRecentSearch(list, { query: "b", facetType: "all", facetValue: "" });
      list = recordRecentSearch(list, { query: "", facetType: "author", facetValue: "Sky" });
      const removed = removeRecentSearch(list, keyOf({ query: "b", facetType: "all", facetValue: "" }));
      assert.equal(removed.length, 2);
      assert.equal(removed.some((e) => e.query === "b"), false);
    });

    it("unknown key is a no-op", () => {
      const list = recordRecentSearch([], { query: "a", facetType: "all", facetValue: "" });
      assert.equal(removeRecentSearch(list, "nope|all|").length, 1);
    });
  });

  describe("clearRecentSearches", () => {
    it("empties the list", () => {
      assert.deepEqual(clearRecentSearches(), []);
    });
  });

  describe("sanitizeRecentSearches", () => {
    it("rejects garbage shapes", () => {
      assert.deepEqual(sanitizeRecentSearches(null), []);
      assert.deepEqual(sanitizeRecentSearches("nope"), []);
      assert.deepEqual(sanitizeRecentSearches({}), []);
    });

    it("keeps valid entries, drops folder-only / empty / invalid rows", () => {
      const clean = sanitizeRecentSearches([
        { query: "core", facetType: "all", facetValue: "", at: 5 },
        { query: "", facetType: "author", facetValue: "Elon Musk", at: 6 },
        { query: "", facetType: "folder", facetValue: "Tech", at: 7 },
        { query: "", facetType: "all", facetValue: "", at: 8 },
        "junk",
        null,
        // query:42 sanitizes to an empty-query facet entry and is still meaningful
        { query: 42, facetType: "author", facetValue: "X", at: 9 },
        { query: "", facetType: "all", facetValue: "All bookmarks", at: 10 },
      ]);
      assert.equal(clean.length, 3);
      assert.equal(clean[0].query, "core");
      assert.equal(clean[0].at, 5);
      assert.equal(clean[1].facetValue, "Elon Musk");
      assert.equal(clean[2].facetValue, "X");
      assert.equal(clean[2].query, "");
    });

    it("drops duplicates and caps size", () => {
      const raw = Array.from({ length: RECENT_SEARCH_LIMIT + 2 }, (_, i) => ({
        query: `q${i}`,
        facetType: "all",
        facetValue: "",
      }));
      raw.push({ query: "q1", facetType: "all", facetValue: "" });
      const clean = sanitizeRecentSearches(raw);
      assert.equal(clean.length, RECENT_SEARCH_LIMIT);
      assert.equal(clean.some((e) => e.query === `q${RECENT_SEARCH_LIMIT + 1}`), false);
    });
  });
});
