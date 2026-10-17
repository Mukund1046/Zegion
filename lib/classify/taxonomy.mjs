/** Reversible taxonomy mapping layer. Raw stored data is never rewritten. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

function loadTaxonomy() {
  const raw = readFileSync(join(dir, "taxonomy.json"), "utf8");
  return JSON.parse(raw);
}

let cached = null;

export function getTaxonomy() {
  if (!cached) cached = loadTaxonomy();
  return cached;
}

/** Map a raw slug to its canonical label. Unknown slugs → `other` (never dropped). */
export function canonicalize(raw) {
  const taxonomy = getTaxonomy();
  if (typeof raw !== "string") return "other";
  const slug = raw.toLowerCase().trim();
  return taxonomy.map[slug] ?? "other";
}

/**
 * Validate a model-produced slug WITHOUT conflating failure modes.
 * - known slug → {ok: true, canonical}
 * - unknown slug → {ok: false, invalid: true} — an `invalid_label` outcome
 *   for measuring model/schema failures, never silently scored as a
 *   genuine semantic `other`.
 */
export function validateSlug(raw) {
  if (typeof raw !== "string") return { ok: false, invalid: true };
  const slug = raw.toLowerCase().trim();
  const taxonomy = getTaxonomy();
  if (slug in taxonomy.map) return { ok: true, canonical: taxonomy.map[slug] };
  return { ok: false, invalid: true };
}

/** Raw slugs present in data but absent from the map (should be []). */
export function findUnmapped(slugs) {
  const taxonomy = getTaxonomy();
  return [...new Set(slugs)].filter(
    (s) => typeof s === "string" && !(s.toLowerCase().trim() in taxonomy.map)
  );
}

/** Canonical labels valid for classifier output (excludes pure states). */
export function outputLabels() {
  return getTaxonomy().canonical.filter(
    (c) => !["unclassified", "unknown", "uncertain"].includes(c)
  );
}
