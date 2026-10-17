/**
 * Textual evidence signals for cascade routing. Pure functions over post
 * text — no models, no thresholds from thin air (the thin-evidence cutoff
 * is measured on the frozen benchmark; see THIN_TOKEN_CUTOFF note).
 *
 * - content-free: nothing classifiable at all (bare links, emoji only).
 *   Routes to `unknown`, never to a category.
 * - thin-evidence: too few informative tokens for agreement or high-band
 *   acceptance to mean anything. Blocks false confirmation; the item
 *   arbitrates (or stays uncertain) instead.
 * - tutorial intent: explicit instructional framing. Counts as evidence
 *   FOR the taxonomy (bypasses the thin guard, breaks ties toward
 *   technique) — never a new category.
 */

/** Explicit instructional framing (primary-intent cues, not keywords). */
const TUTORIAL_PATTERNS = [
  /\btutorial\b/i,
  /\bstep[\s-]*by[\s-]*step\b/i,
  /\bhow[\s-]*to\b/i,
  /\bwalkthrough\b/i,
  /\bbreakdown\b/i,
  /\bhow\s+i\s+(built|made|created|shipped)\b/i,
  /\bguide\b/i,
  /\brecipe\b/i,
  /\b crash[\s-]*course\b/i,
  /\btips\b/i,
  /\bhere(?:'s| is) how\b/i,
];

/** Strip everything that carries no semantic content for classification. */
export function evidenceTokens(text) {
  const tokens = String(text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#]\w+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  return [...new Set(tokens)];
}

/** True when no classifiable content remains (bare links, emoji, pings). */
export function isContentFree(text) {
  return evidenceTokens(text).length === 0;
}

/**
 * Thin-evidence cutoff, measured on frozen dataset-benchmark-v1.json
 * (informative tokens = lowercase words len>=2, digits/URLs/mentions stripped):
 *   K=1: flags 5 rows, flips 1 correct head accept to uncertain
 *   K=2: flags 19 rows, flips 2 correct head accepts to uncertain
 *   K=3: flags 43 rows, flips 8 correct head accepts to uncertain
 * K=2 blocks the demonstrated false-confirmation mode (1-token agreement)
 * with minimal harm; flips land in reviewable `uncertain`, never a label.
 * Change only with re-measurement.
 */
export const THIN_TOKEN_CUTOFF = 2;

/** True when the input is too thin for agreement to confirm anything. */
export function isThinEvidence(text, cutoff = THIN_TOKEN_CUTOFF) {
  if (isContentFree(text)) return false; // content-free has its own rule
  return evidenceTokens(text).length <= cutoff;
}

/** Explicit instructional framing present? Returns the matched cue or null. */
export function detectTutorialIntent(text) {
  const value = String(text ?? "");
  for (const re of TUTORIAL_PATTERNS) {
    const m = value.match(re);
    if (m) return m[0].toLowerCase();
  }
  return null;
}
