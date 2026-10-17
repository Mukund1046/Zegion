/**
 * Build gold-seeded centroid artifacts from AUDITED dev rows only.
 *
 * Hard guarantees (asserted, not assumed):
 * - Only rows with audit.status === "audited" and a canonical head label.
 * - NEVER a holdout row: holdout ids are rejected if they appear.
 * - unknown/other/uncertain rows never seed centroids (heterogeneous or
 *   evidence-free by definition).
 * - Every centroid records the exact row ids that produced it.
 *
 * Usage: node lib/classify/local/build-centroids-gold.mjs
 *   [--dataset lib/classify/eval/dataset-benchmark-v1.json]
 *   [--out lib/classify/local/artifacts/gold] [--max-per-class 150]
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

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const datasetPath = resolve(process.cwd(), get("--dataset", join(HERE, "..", "eval", "dataset-benchmark-v1.json")));
  const outDir = resolve(process.cwd(), get("--out", join(HERE, "artifacts", "gold")));
  const maxPerClass = Number(get("--max-per-class", "150")) || 150;

  const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
  const taxonomy = getTaxonomy();
  if (taxonomy.version !== TAXONOMY_VERSION) {
    throw new Error(`taxonomy mismatch: artifacts require ${TAXONOMY_VERSION}, found ${taxonomy.version}`);
  }
  const headLabels = new Set(taxonomy.canonical.filter((c) => !["other", "unclassified", "unknown", "uncertain"].includes(c)));

  const perLabel = new Map();
  let skippedHoldout = 0;
  let skippedUnaudited = 0;
  let skippedNonHead = 0;
  for (const row of dataset.rows) {
    if (row.split === "holdout") {
      skippedHoldout += 1;
      continue;
    }
    if (row.audit?.status !== "audited") {
      skippedUnaudited += 1;
      continue;
    }
    const label = row.audit.label;
    if (!headLabels.has(label)) {
      skippedNonHead += 1;
      continue;
    }
    const text = (row.text || "").trim();
    if (!text) {
      skippedNonHead += 1;
      continue;
    }
    if (!perLabel.has(label)) perLabel.set(label, []);
    if (perLabel.get(label).length < maxPerClass) perLabel.get(label).push({ id: row.id, text });
  }
  console.log(`eligible=${[...perLabel.values()].reduce((n, v) => n + v.length, 0)} skippedHoldout=${skippedHoldout} skippedUnaudited=${skippedUnaudited} skippedNonHead=${skippedNonHead}`);

  const labeled = {};
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
    counts[label] = vectors.length;
    trainIds[label] = items.map((b) => b.id);
  }

  const centroids = buildCentroids(labeled);
  const version = `centroids-gold-v2-${new Date().toISOString().slice(0, 10)}`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "centroids.json"), JSON.stringify({ version, dim: centroids[Object.keys(centroids)[0]].length, centroids }) + "\n");
  writeFileSync(
    join(outDir, "metadata.json"),
    JSON.stringify(
      {
        modelVersion: version,
        labelSet: Object.keys(centroids).sort(),
        trainingDatasetVersion: "dataset-benchmark-v1.json (audited dev rows only)",
        labelSource: "gold-audited",
        thresholds: null,
        embeddingModel: process.env.X_CLASSIFY_EMBED_MODEL || DEFAULT_EMBED_MODEL,
        taxonomyVersion: TAXONOMY_VERSION,
        normalizationVersion: NORMALIZATION_VERSION,
        counts,
        trainIds,
        createdAt: new Date().toISOString(),
        note: "Gold-seeded only. Holdout rows excluded by construction; unknown/other/uncertain rows never seed centroids.",
      },
      null,
      2
    ) + "\n"
  );
  console.log(`wrote ${Object.keys(centroids).length} gold centroids -> ${outDir} (${version})`);
}

main().catch((err) => {
  console.error(`build-centroids-gold failed: ${err.message}`);
  process.exitCode = 1;
});
