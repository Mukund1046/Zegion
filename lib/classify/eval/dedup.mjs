/**
 * Duplicate / near-duplicate detection for eval integrity.
 *
 * Bookmarks contain retweets, repeated links, and near-identical
 * announcements. Same-group posts must never span train/eval splits or
 * models score memorization instead of generalization.
 *
 * Two layers:
 * 1. Exact groups via normalized-text sha1 (lowercase, strip URLs/mentions/
 *    hashtags-symbols/punctuation/whitespace). Fast, whole-corpus.
 * 2. Near-dup pairs via embedding cosine >= threshold (default 0.97).
 *    Applied within the candidate row set; the threshold is reported, not
 *    assumed — rerun with --near-threshold to sensitivity-check.
 */
import { createHash } from "node:crypto";
import { cosine } from "../local/centroids.mjs";

/** Normalize post text for identity comparison. Exported for unit tests. */
export function normalizeText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#]\w+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function textHash(text) {
  return createHash("sha1").update(normalizeText(text)).digest("hex");
}

/**
 * @param {{id: string, text: string}[]} items
 * @returns {{groups: {hash: string, ids: string[]}[], groupOf: Map<string, string>}}
 *   groups with >1 member are exact-duplicate groups.
 */
export function exactDupGroups(items) {
  const byHash = new Map();
  for (const item of items) {
    const hash = textHash(item.text);
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(item.id);
  }
  const groups = [...byHash.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([hash, ids]) => ({ hash, ids: [...ids].sort() }));
  const groupOf = new Map();
  for (const g of groups) for (const id of g.ids) groupOf.set(id, g.hash);
  return { groups, groupOf };
}

/**
 * Pairwise near-duplicate scan over precomputed vectors.
 * @param {{id: string}[]} items parallel to `vectors`
 * @param {number[][]} vectors normalized embeddings
 * @param {number} threshold cosine >= threshold counts as near-dup
 * @returns {{a: string, b: string, similarity: number}[]} sorted best-first
 */
export function nearDupPairs(items, vectors, threshold = 0.97) {
  const pairs = [];
  for (let i = 0; i < vectors.length; i += 1) {
    for (let j = i + 1; j < vectors.length; j += 1) {
      const similarity = cosine(vectors[i], vectors[j]);
      if (similarity >= threshold) pairs.push({ a: items[i].id, b: items[j].id, similarity });
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

/**
 * Union duplicate groups (exact + near) into connected components so a
 * split can keep every component whole.
 * @returns {string[][]} components (each: ids that must stay together)
 */
export function unionComponents(exactGroups, nearPairs) {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    parent.set(find(a), find(b));
  };
  for (const g of exactGroups) for (let i = 1; i < g.ids.length; i += 1) union(g.ids[0], g.ids[i]);
  for (const p of nearPairs) union(p.a, p.b);
  const components = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(id);
  }
  return [...components.values()].map((ids) => ids.sort());
}
