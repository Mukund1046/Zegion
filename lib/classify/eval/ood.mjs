/**
 * OOD scoring for the local head (pure functions, no model I/O).
 *
 * Adapted from proven OOD patterns (pytorch-ood detectors) to cosine
 * similarities over class centroids — no new dependency:
 * - min-distance: 1 - max similarity (Mahalanobis with diagonal covariance)
 * - MSP: max softmax(similarities) — low means out-of-distribution
 * - energy: -logsumexp(similarities) — high means out-of-distribution
 * - margin: top1 - top2 (already used for selective classification)
 *
 * OOD here means "reference outside the 10-head label space"
 * (other/unknown/uncertain). Scores are routing signals, never probabilities.
 */

/** Softmax over a similarity vector (numerically stable). */
export function softmax(sims) {
  const max = Math.max(...sims);
  const exps = sims.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * @param {Record<string, number>} scores label -> cosine similarity
 * @returns {{top1, top1Score, top2, top2Score, margin, minDistance, msp, energy}}
 */
export function scoreSignals(scores) {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const sims = ranked.map(([, s]) => s);
  const probs = softmax(sims);
  const energy = -Math.log(sims.reduce((acc, s) => acc + Math.exp(s), 0));
  return {
    top1: ranked.length > 0 ? ranked[0][0] : null,
    top1Score: ranked.length > 0 ? ranked[0][1] : null,
    top2: ranked.length > 1 ? ranked[1][0] : null,
    top2Score: ranked.length > 1 ? ranked[1][1] : null,
    margin: ranked.length > 1 ? ranked[0][1] - ranked[1][1] : null,
    minDistance: ranked.length > 0 ? 1 - ranked[0][1] : null,
    msp: probs.length > 0 ? Math.max(...probs) : null,
    energy,
  };
}

/**
 * Sweep a threshold over dev items, maximizing F1 for OOD detection.
 * `higherIsOod`: true for distance/energy (high = OOD), false for
 * margin/msp/topScore (low = OOD).
 * @returns {{threshold, precision, recall, f1, predicted, actual} | null}
 */
export function fitThreshold(items, key, higherIsOod) {
  const usable = items.filter(
    (r) => typeof r.signals[key] === "number" && Number.isFinite(r.signals[key])
  );
  if (usable.length === 0) return null;
  const values = [...new Set(usable.map((r) => r.signals[key]))].sort((a, b) => a - b);
  let best = null;
  for (const t of values) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const r of usable) {
      const predicted = higherIsOod ? r.signals[key] >= t : r.signals[key] <= t;
      if (predicted && r.isOod) tp += 1;
      else if (predicted) fp += 1;
      else if (r.isOod) fn += 1;
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    if (!best || f1 > best.f1) best = { threshold: t, precision, recall, f1, predicted: tp + fp, actual: tp + fn };
  }
  return best;
}

/**
 * Evaluate a fixed threshold on items (e.g., holdout, unchanged).
 * @returns {{predicted, actual, precision, recall, f1, falseOod, headRetained}}
 *   headRetained: fraction of non-OOD rows NOT flagged (coverage preserved).
 */
export function evaluateThreshold(items, key, threshold, higherIsOod) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let headTotal = 0;
  let headKept = 0;
  for (const r of items) {
    const v = r.signals[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const predicted = higherIsOod ? v >= threshold : v <= threshold;
    if (predicted && r.isOod) tp += 1;
    else if (predicted) fp += 1;
    else if (r.isOod) fn += 1;
    if (!r.isOod) {
      headTotal += 1;
      if (!predicted) headKept += 1;
    }
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  return {
    predicted: tp + fp,
    actual: tp + fn,
    precision,
    recall,
    f1: precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null,
    falseOod: fp,
    headRetained: headTotal > 0 ? headKept / headTotal : null,
  };
}

/** AND-combination of two threshold rules (both must fire for OOD). */
export function evaluateAnd(items, ruleA, ruleB) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let headTotal = 0;
  let headKept = 0;
  const fire = (r) => {
    const va = r.signals[ruleA.key];
    const vb = r.signals[ruleB.key];
    if (typeof va !== "number" || typeof vb !== "number") return false;
    const pa = ruleA.higherIsOod ? va >= ruleA.threshold : va <= ruleA.threshold;
    const pb = ruleB.higherIsOod ? vb >= ruleB.threshold : vb <= ruleB.threshold;
    return pa && pb;
  };
  for (const r of items) {
    const predicted = fire(r);
    if (predicted && r.isOod) tp += 1;
    else if (predicted) fp += 1;
    else if (r.isOod) fn += 1;
    if (!r.isOod) {
      headTotal += 1;
      if (!predicted) headKept += 1;
    }
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  return {
    predicted: tp + fp,
    actual: tp + fn,
    precision,
    recall,
    falseOod: fp,
    headRetained: headTotal > 0 ? headKept / headTotal : null,
  };
}
