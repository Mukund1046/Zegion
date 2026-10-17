/**
 * Feedback builder: validated classifications → next local artifact version.
 *
 * Authority order (never violated):
 * 1. Gold audit rows (weight 1.0) — from dataset-benchmark-v1.json dev rows.
 * 2. Validated Zen resolutions (weight configurable, default 0.5) — from a
 *    reviewed resolutions file. RAW Zen output is NEVER accepted: entries
 *    must carry reviewer + reviewedAt to be eligible.
 *
 * Every centroid records exactly which rows produced it ({id, source,
 * weight}). Old artifacts are never overwritten; output goes to a new
 * versioned directory. Promotion to production happens only through
 * eval/promote.mjs against the frozen benchmark.
 *
 * Reviewed-resolutions format (JSON array):
 *   [{id, text, label, reviewer, reviewedAt}]
 * Labels must validate against taxonomy.json; rows without reviewer are
 * rejected loudly, not silently skipped.
 *
 * Usage: node lib/classify/local/build-feedback.mjs
 *   [--dataset lib/classify/eval/dataset-benchmark-v1.json]
 *   [--reviewed <path>] [--zen-weight 0.5]
 *   [--out lib/classify/local/artifacts/feedback-v1]
 *   [--max-per-class 150]
 *   [--posted-after <iso>] [--posted-before <iso>]
 * Temporal filters apply to gold dataset rows only (ablation studies);
 * reviewed entries always participate and are reported separately.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTaxonomy } from "../taxonomy.mjs";
import { buildCentroids } from "./centroids.mjs";
import { DEFAULT_EMBED_MODEL, embedTexts } from "./embed.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EMBED_BATCH = 32;
const TAXONOMY_VERSION = "experimental-001";
const NORMALIZATION_VERSION = "v0-raw";
const GOLD_WEIGHT = 1.0;

function headLabels(taxonomy) {
  return new Set(taxonomy.canonical.filter((c) => !["other", "unclassified", "unknown", "uncertain"].includes(c)));
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const datasetPath = resolve(process.cwd(), get("--dataset", join(HERE, "..", "eval", "dataset-benchmark-v1.json")));
  const reviewedPath = get("--reviewed", null);
  const zenWeight = Number(get("--zen-weight", "0.5"));
  if (!(zenWeight > 0) || zenWeight > 1) throw new Error("--zen-weight must be in (0, 1]");
  const outDir = resolve(process.cwd(), get("--out", join(HERE, "artifacts", "feedback-v1")));
  const maxPerClass = Number(get("--max-per-class", "150")) || 150;
  const postedAfter = get("--posted-after", null);
  const postedBefore = get("--posted-before", null);
  const afterMs = postedAfter ? Date.parse(postedAfter) : null;
  const beforeMs = postedBefore ? Date.parse(postedBefore) : null;
  if ((postedAfter && !Number.isFinite(afterMs)) || (postedBefore && !Number.isFinite(beforeMs))) {
    throw new Error("unparseable --posted-after/--posted-before date");
  }

  const taxonomy = getTaxonomy();
  if (taxonomy.version !== TAXONOMY_VERSION) {
    throw new Error(`taxonomy mismatch: artifacts require ${TAXONOMY_VERSION}, found ${taxonomy.version}`);
  }
  const heads = headLabels(taxonomy);
  const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));

  // Provenance-tracked training pool: id -> {text, label, source, weight}.
  const pool = new Map();
  const addEntry = (id, text, label, source, weight) => {
    if (!id || !text?.trim() || !heads.has(label)) return "skipped-non-head";
    if (pool.has(id)) return "skipped-duplicate";
    pool.set(id, { id, text: text.trim(), label, source, weight });
    return "added";
  };

  let goldAdded = 0;
  let goldDateSkipped = 0;
  for (const row of dataset.rows) {
    if (row.split === "holdout") continue; // hard exclusion, asserted below
    if (row.audit?.status !== "audited") continue;
    if (afterMs !== null || beforeMs !== null) {
      const t = row.postedAt ? Date.parse(row.postedAt) : Number.NaN;
      if (!Number.isFinite(t) || (afterMs !== null && t < afterMs) || (beforeMs !== null && t >= beforeMs)) {
        goldDateSkipped += 1;
        continue;
      }
    }
    if (addEntry(row.id, row.text, row.audit.label, "gold", GOLD_WEIGHT) === "added") goldAdded += 1;
  }

  let zenAdded = 0;
  let zenRejected = 0;
  if (reviewedPath) {
    const reviewed = JSON.parse(readFileSync(resolve(process.cwd(), reviewedPath), "utf8"));
    if (!Array.isArray(reviewed)) throw new Error("reviewed file must be a JSON array");
    for (const entry of reviewed) {
      if (!entry || typeof entry !== "object" || !entry.reviewer || !entry.reviewedAt) {
        zenRejected += 1;
        continue;
      }
      const outcome = addEntry(entry.id, entry.text, entry.label, "zen-validated", zenWeight);
      if (outcome === "added") zenAdded += 1;
      else zenRejected += 1;
    }
  }
  console.log(`pool: gold=${goldAdded} zen-validated=${zenAdded} rejected=${zenRejected} dateSkipped=${goldDateSkipped}`);

  // Hard exclusion audit: no holdout id may enter the pool, ever.
  const holdoutIds = new Set(dataset.rows.filter((r) => r.split === "holdout").map((r) => r.id));
  for (const id of pool.keys()) {
    if (holdoutIds.has(id)) throw new Error(`holdout leak: ${id} entered the training pool`);
  }

  const perLabel = new Map();
  for (const entry of pool.values()) {
    if (!perLabel.has(entry.label)) perLabel.set(entry.label, []);
    if (perLabel.get(entry.label).length < maxPerClass) perLabel.get(entry.label).push(entry);
  }

  const labeled = {};
  const weights = {};
  const counts = {};
  const trainIds = {};
  for (const [label, items] of perLabel) {
    const vectors = [];
    for (let i = 0; i < items.length; i += EMBED_BATCH) {
      const batch = items.slice(i, i + EMBED_BATCH);
      const embs = await embedTexts(batch.map((b) => b.text));
      vectors.push(...embs);
      console.log(`embedded ${label}: ${Math.min(i + EMBED_BATCH, items.length)}/${items.length}`);
    }
    labeled[label] = vectors;
    weights[label] = items.map((b) => b.weight);
    counts[label] = vectors.length;
    trainIds[label] = items.map((b) => ({ id: b.id, source: b.source, weight: b.weight }));
  }

  const centroids = buildCentroids(labeled, weights);
  const version = `centroids-feedback-v1-${new Date().toISOString().slice(0, 10)}`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "centroids.json"), JSON.stringify({ version, dim: centroids[Object.keys(centroids)[0]].length, centroids }) + "\n");
  writeFileSync(
    join(outDir, "metadata.json"),
    JSON.stringify(
      {
        modelVersion: version,
        labelSet: Object.keys(centroids).sort(),
        trainingDatasetVersion: "dataset-benchmark-v1.json (audited dev) + reviewed resolutions",
        labelSource: "gold-audited + zen-validated (weighted)",
        goldWeight: GOLD_WEIGHT,
        zenWeight,
        temporalFilter: postedAfter || postedBefore ? { postedAfter, postedBefore, dateSkipped: goldDateSkipped } : null,
        thresholds: null,
        embeddingModel: process.env.X_CLASSIFY_EMBED_MODEL || DEFAULT_EMBED_MODEL,
        taxonomyVersion: TAXONOMY_VERSION,
        normalizationVersion: NORMALIZATION_VERSION,
        counts,
        trainIds,
        createdAt: new Date().toISOString(),
        note: "Raw Zen output never accepted: reviewed entries require reviewer + reviewedAt. Promotion only via eval/promote.mjs.",
      },
      null,
      2
    ) + "\n"
  );
  console.log(`wrote ${Object.keys(centroids).length} feedback centroids -> ${outDir} (${version})`);
}

main().catch((err) => {
  console.error(`build-feedback failed: ${err.message}`);
  process.exitCode = 1;
});
