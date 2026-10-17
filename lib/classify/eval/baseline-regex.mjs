/**
 * Regex baseline: scores Field Theory's rule-based classifyBookmark against
 * the silver labels already in the store. Measures per-category precision —
 * the exact evidence the cascade needs to decide which regex rules may
 * become terminal routing rules vs. mere evidence.
 *
 * Usage: node lib/classify/eval/baseline-regex.mjs [--limit 2000]
 * Reads live data via `ft list` (same source as export-bookmarks.js).
 */
import { classifyBookmark } from "../../../node_modules/fieldtheory/dist/bookmark-classify.js";
import { loadEntries } from "./store.mjs";

function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) || 2000 : 2000;
  const entries = loadEntries(limit);
  // Per-category tallies over silver-labeled items only.
  const stats = new Map(); // cat -> {predicted, correct, actual}
  let labeled = 0;
  let agreement = 0;
  let regexCovered = 0;
  const bump = (cat, key) => {
    if (!stats.has(cat)) stats.set(cat, { predicted: 0, correct: 0, actual: 0 });
    stats.get(cat)[key] += 1;
  };

  for (const e of entries) {
    const silver = (e.primaryCategory || "unclassified").toLowerCase().trim();
    const predicted = classifyBookmark({ text: e.text || "", links: e.links || [] });
    if (predicted.categories.length > 0) regexCovered += 1;
    if (silver === "unclassified") continue;
    labeled += 1;
    bump(predicted.primary, "predicted");
    bump(silver, "actual");
    if (predicted.primary === silver) {
      agreement += 1;
      bump(silver, "correct");
    }
  }

  const rows = [...stats.entries()]
    .filter(([cat]) => cat !== "unclassified")
    .map(([cat, s]) => ({
      category: cat,
      precision: s.predicted > 0 ? s.correct / s.predicted : null,
      recall: s.actual > 0 ? s.correct / s.actual : null,
      predicted: s.predicted,
      actual: s.actual,
    }))
    .sort((a, b) => b.actual - a.actual);

  console.log(`items=${entries.length} silver-labeled=${labeled} regex-coverage=${regexCovered}`);
  console.log(`primary-agreement=${agreement}/${labeled} (${labeled ? (100 * agreement / labeled).toFixed(1) : "0.0"}%)`);
  console.log("category precision recall predicted actual");
  for (const r of rows) {
    const p = r.precision === null ? "   n/a" : r.precision.toFixed(3);
    const rec = r.recall === null ? "   n/a" : r.recall.toFixed(3);
    console.log(`${r.category.padEnd(14)} ${p}  ${rec}  ${String(r.predicted).padStart(5)}  ${r.actual}`);
  }
}

main();
