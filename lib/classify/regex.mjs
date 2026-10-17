/**
 * RegexProvider — deterministic first layer (Field Theory rules, wrapped).
 *
 * Imports (never forks) FT's classifyBookmark. Hits are evidence, not
 * verdicts: terminal acceptance of a rule happens only after the gold
 * calibration work promotes it. No-match items are omitted (caller maps
 * gaps to `unknown`).
 */
import { classifyBookmark } from "../../node_modules/fieldtheory/dist/bookmark-classify.js";
import { assertProviderShape, createResult } from "./contract.mjs";
import { canonicalize } from "./taxonomy.mjs";

export const PROVIDER_VERSION = "ft-rules-v1";

export function createRegexProvider() {
  const provider = {
    name: "regex",
    version: PROVIDER_VERSION,
    async classifyBatch(items) {
      if (!items || items.length === 0) return [];
      const startedMs = Date.now();
      const latencyMs = Date.now() - startedMs;
      const results = [];
      for (const item of items) {
        const predicted = classifyBookmark({ text: item.text || "", links: item.links || [] });
        if (predicted.categories.length === 0) continue;
        const primary = canonicalize(predicted.primary);
        results.push({
          id: item.id,
          ...createResult({
            label: primary,
            confidence: null,
            scores: null,
            candidates: [...new Set([primary, ...predicted.categories.map(canonicalize)])],
            provider: "regex",
            model: "fieldtheory-rules",
            latencyMs,
            version: PROVIDER_VERSION,
            fallbackUsed: false,
          }),
        });
      }
      return results;
    },
  };
  assertProviderShape(provider);
  return provider;
}
