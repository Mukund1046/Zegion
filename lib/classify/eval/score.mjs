/**
 * Shared scoring for eval (harness + shadow runner): identical metrics
 * everywhere. Reference labels are audit.label when audited, otherwise the
 * canonicalized silver category (silver = bootstrapping, never ground truth).
 */
import { canonicalize, validateSlug } from "../taxonomy.mjs";

export function referenceLabel(row) {
  if (row.audit?.status === "audited" && row.audit.label) return row.audit.label;
  return canonicalize(row.silverCategory);
}

export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/**
 * @param {Map<string, {label: string}>} predictions id -> prediction
 * @param {object[]} rows dataset rows
 */
export function score(predictions, rows) {
  let correct = 0;
  let scored = 0;
  let invalid = 0;
  const perClass = new Map(); // label -> {tp, fp, fn}
  const confusion = new Map(); // "ref=>pred" -> count
  const bump = (label, key) => {
    if (!perClass.has(label)) perClass.set(label, { tp: 0, fp: 0, fn: 0 });
    perClass.get(label)[key] += 1;
  };
  for (const row of rows) {
    const ref = referenceLabel(row);
    const pred = predictions.get(row.id);
    if (!pred) {
      bump(ref, "fn");
      continue;
    }
    // Invalid slugs never propagate: counted separately, scored as wrong.
    if (!validateSlug(pred.label).ok) invalid += 1;
    scored += 1;
    if (pred.label === ref) {
      correct += 1;
      bump(ref, "tp");
    } else {
      bump(pred.label, "fp");
      bump(ref, "fn");
      const key = `${ref}=>${pred.label}`;
      confusion.set(key, (confusion.get(key) || 0) + 1);
    }
  }
  const classes = [...perClass.entries()].map(([label, s]) => {
    const precision = s.tp + s.fp > 0 ? s.tp / (s.tp + s.fp) : null;
    const recall = s.tp + s.fn > 0 ? s.tp / (s.tp + s.fn) : null;
    const f1 = precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
    return { label, precision, recall, f1, support: s.tp + s.fn };
  });
  const topConfusions = [...confusion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const prf = (tp, fp, fn) => {
    const precision = tp + fp > 0 ? tp / (tp + fp) : null;
    const recall = tp + fn > 0 ? tp / (tp + fn) : null;
    const f1 = precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
    return { precision, recall, f1 };
  };
  // Micro: aggregate counts first (dominated by head classes).
  let microTp = 0;
  let microFp = 0;
  let microFn = 0;
  // Macro: mean over classes with support (treats tail classes equally).
  let macroP = 0;
  let macroR = 0;
  let macroF = 0;
  let macroN = 0;
  for (const [, s] of perClass) {
    microTp += s.tp;
    microFp += s.fp;
    microFn += s.fn;
    if (s.tp + s.fn > 0) {
      const m = prf(s.tp, s.fp, s.fn);
      if (m.precision !== null && m.recall !== null && m.f1 !== null) {
        macroP += m.precision;
        macroR += m.recall;
        macroF += m.f1;
        macroN += 1;
      }
    }
  }
  const micro = prf(microTp, microFp, microFn);
  const macro = macroN > 0
    ? { precision: macroP / macroN, recall: macroR / macroN, f1: macroF / macroN, classes: macroN }
    : { precision: null, recall: null, f1: null, classes: 0 };
  // Coverable accuracy: rows whose reference the predictor could ever emit
  // (a 10-head model can never match an `other`/`unclassified` reference —
  // scoring those as errors measures taxonomy coverage, not model quality).
  const emitted = new Set([...predictions.values()].map((p) => p.label));
  let coverCorrect = 0;
  let coverTotal = 0;
  for (const row of rows) {
    if (!emitted.has(referenceLabel(row))) continue;
    coverTotal += 1;
    if (predictions.get(row.id)?.label === referenceLabel(row)) coverCorrect += 1;
  }
  return {
    accuracy: scored > 0 ? correct / scored : null,
    micro,
    macro,
    invalid,
    abstained: rows.length - scored,
    coverableAccuracy: coverTotal > 0 ? coverCorrect / coverTotal : null,
    coverableRows: coverTotal,
    scored,
    classes: classes.sort((a, b) => b.support - a.support),
    topConfusions: topConfusions.map(([pair, count]) => ({ pair, count })),
  };
}
