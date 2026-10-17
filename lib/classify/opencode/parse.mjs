/**
 * Balanced-bracket JSON-array extractor (ported from Field Theory's
 * bookmark-classify-llm.js so CLI/HTTP outputs parse with identical
 * semantics). Finds the first span that parses as an object array.
 *
 * Full pipeline: extract → JSON.parse → Zod schema → taxonomy validation
 * → normalization. Model output never enters the classifier unchecked.
 */
import { z } from "zod";
import { validateSlug } from "../taxonomy.mjs";

/** Invalid model slugs become this marker — counted, never silently `other`. */
export const INVALID_LABEL = "invalid_label";

/** Runtime schema for one model-returned item. TypeScript types are not a boundary. */
const BatchItemSchema = z.object({
  id: z.string().min(1),
  categories: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  primary: z.string().optional(),
});

const BatchResponseSchema = z.array(BatchItemSchema);
export function extractBalancedArraySpan(raw, start) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") {
      depth += 1;
      continue;
    }
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

export function extractJsonArray(raw) {
  const text = String(raw ?? "");
  for (let start = text.indexOf("["); start !== -1; start = text.indexOf("[", start + 1)) {
    const candidate = extractBalancedArraySpan(text, start);
    if (!candidate) return null;
    try {
      const parsed = JSON.parse(candidate);
      const looksLikeObjectArray =
        Array.isArray(parsed) &&
        (parsed.length === 0 ||
          parsed.some((item) => item != null && typeof item === "object" && !Array.isArray(item)));
      if (looksLikeObjectArray) return candidate;
    } catch {
      // Keep scanning for a later bracket span that is valid JSON.
    }
  }
  return null;
}

/**
 * Validate + normalize a parsed batch response against the requested ids.
 * Unknown ids are dropped; empty results are dropped (caller → `unknown`).
 * A primary failing taxonomy validation becomes INVALID_LABEL (counted
 * downstream, never silently `other`); the raw slug rides in `rawPrimary`
 * for forensics (slugs only — never user text).
 */
export function normalizeBatchResponse(parsed, batchIds) {
  const checked = BatchResponseSchema.safeParse(parsed);
  if (!checked.success) throw new Error("Response failed schema validation");
  const results = [];
  for (const item of checked.data) {
    if (!batchIds.has(item.id)) continue;
    const rawArr = item.categories ?? item.domains ?? [];
    const valid = [];
    let sawInvalid = false;
    for (const c of rawArr) {
      const v = validateSlug(c);
      if (v.ok && v.canonical !== "unclassified" && v.canonical !== "unknown" && v.canonical !== "uncertain") {
        valid.push(v.canonical);
      } else if (!v.ok) {
        sawInvalid = true;
      }
    }
    const categories = [...new Set(valid)];
    const rawPrimary = typeof item.primary === "string" && item.primary.length > 0
      ? item.primary.toLowerCase().trim()
      : categories[0] ?? null;
    if (!rawPrimary) continue;
    const primaryCheck = validateSlug(rawPrimary);
    if (!primaryCheck.ok) {
      results.push({ id: item.id, categories, primary: INVALID_LABEL, rawPrimary, invalid: true });
    } else {
      results.push({
        id: item.id,
        categories,
        primary: primaryCheck.canonical,
        rawPrimary,
        invalid: sawInvalid,
      });
    }
  }
  return results;
}

/** Parse raw model text into validated batch results (throws on no JSON). */
export function parseBatchResponse(raw, batchIds) {
  const jsonArray = extractJsonArray(raw);
  if (!jsonArray) throw new Error("No JSON array found in response");
  return normalizeBatchResponse(JSON.parse(jsonArray), batchIds);
}
