/**
 * Centroid / cosine-kNN classification head. Pure math, no model I/O —
 * fully unit-testable with synthetic vectors.
 *
 * Each canonical label owns a centroid (mean of its training vectors).
 * Ranking is by cosine similarity; the top-1 margin (best minus runner-up)
 * is reported as an uncalibrated score, never a probability. Calibration
 * against the eval harness decides later what margins mean.
 */

export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

export function norm(a) {
  return Math.sqrt(dot(a, a));
}

export function cosine(a, b) {
  const denom = norm(a) * norm(b);
  if (!(denom > 0)) return 0;
  return dot(a, b) / denom;
}

export function meanVector(vectors, weights = null) {
  const dim = vectors[0].length;
  const mean = new Array(dim).fill(0);
  let total = 0;
  for (let k = 0; k < vectors.length; k += 1) {
    const w = weights ? weights[k] ?? 1 : 1;
    total += w;
    for (let i = 0; i < dim; i += 1) mean[i] += vectors[k][i] * w;
  }
  if (!(total > 0)) return mean;
  for (let i = 0; i < dim; i += 1) mean[i] /= total;
  return mean;
}

/**
 * @param {Record<string, number[][]>} labeled label -> training vectors
 * @param {Record<string, number[]>} [weights] label -> per-vector weights
 *   (gold 1.0, validated-Zen < 1.0). Unweighted when omitted.
 * @returns {Record<string, number[]>} label -> centroid
 */
export function buildCentroids(labeled, weights = {}) {
  const centroids = {};
  for (const [label, vectors] of Object.entries(labeled)) {
    if (vectors.length === 0) continue;
    centroids[label] = meanVector(vectors, weights[label]);
  }
  return centroids;
}

/**
 * Rank labels for one vector. Returns all labels sorted best-first with
 * margins relative to the winner (winner margin = gap to runner-up).
 * @returns {{label: string, similarity: number, margin: number}[]}
 */
export function rankVector(vector, centroids) {
  const scored = Object.entries(centroids).map(([label, centroid]) => ({
    label,
    similarity: cosine(vector, centroid),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.map((s, i) => ({
    ...s,
    margin: i === 0 ? s.similarity - (scored[1]?.similarity ?? s.similarity) : 0,
  }));
}
