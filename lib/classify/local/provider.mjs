/**
 * LocalMLProvider — offline embedding + centroid/kNN head.
 * Satisfies the ClassifierProvider contract (see ../contract.mjs).
 *
 * Loads versioned artifacts (centroids.json + metadata.json); never trains
 * at request time. Confidence stays null until eval calibration proves the
 * margins behave like probabilities; raw margins ride in `scores`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertProviderShape, createResult } from "../contract.mjs";
import { embedTexts } from "./embed.mjs";
import { rankVector } from "./centroids.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

export const PROVIDER_VERSION = "v1";
/** Production default: gold-seeded artifacts. Silver v1 remains as reference. */
export const DEFAULT_ARTIFACT_DIR = join(HERE, "artifacts", "gold");

export function loadArtifacts(dir = join(HERE, "artifacts")) {
  const centroids = JSON.parse(readFileSync(join(dir, "centroids.json"), "utf8"));
  const metadata = JSON.parse(readFileSync(join(dir, "metadata.json"), "utf8"));
  return { centroids: centroids.centroids, metadata, version: centroids.version };
}

export function createLocalMLProvider(overrides = {}) {
  const artifactDir = overrides.artifactDir || DEFAULT_ARTIFACT_DIR;
  let loaded = null;
  const getLoaded = () => {
    if (!loaded) loaded = loadArtifacts(artifactDir);
    return loaded;
  };
  const provider = {
    name: "local-ml",
    version: PROVIDER_VERSION,
    async classifyBatch(items) {
      if (!items || items.length === 0) return [];
      const startedMs = Date.now();
      const { centroids, version } = getLoaded();
      const vectors = await embedTexts(items.map((b) => b.text || ""));
      const latencyMs = Date.now() - startedMs;
      return items.map((item, i) => {
        const ranked = rankVector(vectors[i], centroids);
        const best = ranked[0];
        return {
          id: item.id,
          ...createResult({
            label: best.label,
            confidence: null,
            scores: Object.fromEntries(ranked.map((r) => [r.label, Number(r.similarity.toFixed(4))])),
            candidates: ranked.map((r) => r.label),
            provider: "local-ml",
            model: `centroid-cosine@${version}`,
            latencyMs,
            version: PROVIDER_VERSION,
            fallbackUsed: false,
          }),
        };
      });
    },
  };
  assertProviderShape(provider);
  return provider;
}
