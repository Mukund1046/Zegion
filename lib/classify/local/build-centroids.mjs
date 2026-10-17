/**
 * Build versioned centroid artifacts from silver-labeled head-class posts.
 *
 * Only canonical head labels train centroids; tail classes stay out until
 * validated (they would otherwise anchor centroids on 1–9 noisy samples).
 * Raw stored data is never modified — this only reads.
 *
 * Usage: node lib/classify/local/build-centroids.mjs [--limit 2000]
 *   [--out lib/classify/local/artifacts] [--max-per-class 150]
 * Writes centroids.json + metadata.json into --out.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEntries } from "../eval/store.mjs";
import { canonicalize, getTaxonomy } from "../taxonomy.mjs";
import { buildCentroids } from "./centroids.mjs";
import { DEFAULT_EMBED_MODEL, embedTexts } from "./embed.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EMBED_BATCH = 32;

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const limit = Number(get("--limit", "2000")) || 2000;
  const maxPerClass = Number(get("--max-per-class", "150")) || 150;
  const outDir = resolve(process.cwd(), get("--out", join(HERE, "artifacts")));
  const taxonomy = getTaxonomy();
  const headLabels = new Set(taxonomy.canonical.filter((c) => !["other", "unclassified", "unknown", "uncertain"].includes(c)));

  const entries = loadEntries(limit);
  const perLabel = new Map();
  for (const e of entries) {
    const silver = (e.primaryCategory || "unclassified").toLowerCase().trim();
    if (!headLabels.has(silver)) continue;
    if (canonicalize(silver) !== silver) continue;
    const text = (e.text || "").trim();
    if (!text) continue;
    if (!perLabel.has(silver)) perLabel.set(silver, []);
    if (perLabel.get(silver).length < maxPerClass) perLabel.get(silver).push({ id: e.id, text });
  }

  const labeled = {};
  const counts = {};
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
  }

  const centroids = buildCentroids(labeled);
  const version = `centroids-v1-${new Date().toISOString().slice(0, 10)}`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "centroids.json"), JSON.stringify({ version, dim: centroids[Object.keys(centroids)[0]].length, centroids }) + "\n");
  writeFileSync(
    join(outDir, "metadata.json"),
    JSON.stringify(
      {
        modelVersion: version,
        labelSet: Object.keys(centroids).sort(),
        trainingDatasetVersion: `ft-list(limit=${limit})`,
        thresholds: null,
        embeddingModel: process.env.X_CLASSIFY_EMBED_MODEL || DEFAULT_EMBED_MODEL,
        counts,
        createdAt: new Date().toISOString(),
        note: "Silver head-class labels only; tail classes excluded pending validation. Thresholds unset — derive from eval calibration.",
      },
      null,
      2
    ) + "\n"
  );
  console.log(`wrote ${Object.keys(centroids).length} centroids -> ${outDir} (${version})`);
}

main().catch((err) => {
  console.error(`build-centroids failed: ${err.message}`);
  process.exitCode = 1;
});
