/**
 * Local text embedder (transformers.js, in-process ONNX).
 *
 * Single cached pipeline; the model downloads once into the Hugging Face
 * cache (outside the repo) and is reused across batches and runs.
 * Model id and cache location are env-configurable; no native ML
 * dependency beyond what @huggingface/transformers pulls in.
 */
import { pipeline } from "@huggingface/transformers";

export const DEFAULT_EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

let cached = null;
let cachedModel = null;

/** Load (or reuse) the feature-extraction pipeline. Downloads on first use. */
export async function getEmbedder(model = process.env.X_CLASSIFY_EMBED_MODEL || DEFAULT_EMBED_MODEL) {
  if (cached && cachedModel === model) return cached;
  cached = await pipeline("feature-extraction", model);
  cachedModel = model;
  return cached;
}

/**
 * Embed texts → normalized mean-pooled vectors (plain number arrays).
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, model) {
  if (texts.length === 0) return [];
  const extractor = await getEmbedder(model);
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

/** For tests/dev: drop the cached pipeline so the next call reloads. */
export function resetEmbedder() {
  cached = null;
  cachedModel = null;
}
