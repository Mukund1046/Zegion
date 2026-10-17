/**
 * Calibration analysis primitives. Pure functions over scored predictions —
 * no model I/O, fully unit-testable. Nothing here sets production
 * thresholds; it measures whether thresholds are even justifiable.
 *
 * A scored item: {topScore, margin, correct, label, split}
 * Scores are raw similarities/margins, NEVER presented as probabilities.
 */

/** Sort numeric ascending (NaN-safe: NaNs sink to the end). */
function sortedNums(values) {
  return [...values].sort((a, b) => (Number.isNaN(a) ? 1 : Number.isNaN(b) ? -1 : a - b));
}

function quantile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/**
 * Equal-width reliability bins over `key` ("topScore" | "margin").
 * @returns {{lo, hi, n, correct, precision}[]} (precision null when n = 0)
 */
export function reliabilityBins(items, key, binCount = 10) {
  if (items.length === 0) return [];
  const values = items.map((r) => r[key]).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (values.length === 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const width = hi - lo || 1;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    lo: lo + (width * i) / binCount,
    hi: lo + (width * (i + 1)) / binCount,
    n: 0,
    correct: 0,
    precision: null,
  }));
  for (const r of items) {
    const v = r[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const idx = Math.min(binCount - 1, Math.floor(((v - lo) / width) * binCount));
    bins[idx].n += 1;
    if (r.correct) bins[idx].correct += 1;
  }
  for (const b of bins) if (b.n > 0) b.precision = b.correct / b.n;
  return bins;
}

/**
 * Is bin precision non-decreasing with the score (ignoring empty bins)?
 * Returns {monotonic, violations} — a verdict, not a threshold.
 */
export function checkMonotonic(bins) {
  const filled = bins.filter((b) => b.precision !== null);
  let violations = 0;
  for (let i = 1; i < filled.length; i += 1) {
    if (filled[i].precision < filled[i - 1].precision - 1e-9) violations += 1;
  }
  return { monotonic: violations === 0, violations, bins: filled.length };
}

/**
 * Selective-classification curve: accept the top-k fraction by `key`
 * (descending) and report coverage/precision at each decile.
 * @returns {{fraction, coverage, precision, accepted, errors}[]}
 */
export function selectiveCurve(items, key) {
  const ranked = [...items]
    .filter((r) => typeof r[key] === "number" && Number.isFinite(r[key]))
    .sort((a, b) => b[key] - a[key]);
  const curve = [];
  for (let decile = 1; decile <= 10; decile += 1) {
    const k = Math.max(1, Math.floor((ranked.length * decile) / 10));
    const accepted = ranked.slice(0, k);
    const correct = accepted.filter((r) => r.correct).length;
    curve.push({
      fraction: decile / 10,
      coverage: accepted.length / ranked.length,
      precision: accepted.length > 0 ? correct / accepted.length : null,
      accepted: accepted.length,
      errors: accepted.length - correct,
    });
  }
  return curve;
}

/**
 * Fit a 1-D Platt scaler (logistic on raw score) by gradient descent.
 * Returns {a, b, brierInSample} with p = sigmoid(a*x + b).
 * Small-data guard: refuses to fit with fewer than `minN` samples.
 */
export function fitPlatt(samples, minN = 50) {
  const usable = samples.filter(
    (s) => typeof s.topScore === "number" && Number.isFinite(s.topScore)
  );
  if (usable.length < minN) {
    return { fitted: false, reason: `only ${usable.length} samples (< ${minN})`, a: 0, b: 0 };
  }
  let a = 0;
  let b = 0;
  const lr = 0.5;
  for (let iter = 0; iter < 2000; iter += 1) {
    let ga = 0;
    let gb = 0;
    for (const s of usable) {
      const p = 1 / (1 + Math.exp(-(a * s.topScore + b)));
      const err = p - (s.correct ? 1 : 0);
      ga += err * s.topScore;
      gb += err;
    }
    a -= (lr * ga) / usable.length;
    b -= (lr * gb) / usable.length;
  }
  let brier = 0;
  for (const s of usable) {
    const p = 1 / (1 + Math.exp(-(a * s.topScore + b)));
    brier += (p - (s.correct ? 1 : 0)) ** 2;
  }
  return { fitted: true, a, b, brierInSample: brier / usable.length, n: usable.length };
}

export function applyPlatt(topScore, { a, b }) {
  return 1 / (1 + Math.exp(-(a * topScore + b)));
}

/** Brier score of raw scores treated (naively) as probabilities — baseline. */
export function brierNaive(samples) {
  const usable = samples.filter(
    (s) => typeof s.topScore === "number" && Number.isFinite(s.topScore) && s.topScore >= 0 && s.topScore <= 1
  );
  if (usable.length === 0) return null;
  let sum = 0;
  for (const s of usable) sum += (s.topScore - (s.correct ? 1 : 0)) ** 2;
  return sum / usable.length;
}

export { sortedNums, quantile };
