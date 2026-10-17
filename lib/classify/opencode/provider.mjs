/**
 * OpenCodeProvider — first-class semantic classification backend.
 * Satisfies the ClassifierProvider contract (see ../contract.mjs).
 *
 * Transport selection: keyed HTTP when OPENCODE_API_KEY is set, otherwise
 * the `opencode run` CLI (the only path that can use the keyless free
 * tier). Per-batch model failover walks the configured free-model chain.
 */
import { assertProviderShape, createResult } from "../contract.mjs";
import { buildPrompt } from "./prompt.mjs";
import { INVALID_LABEL, parseBatchResponse } from "./parse.mjs";
import { runOpencode } from "./cli.mjs";
import { runHttp } from "./http.mjs";
import { resolveConfig } from "./config.mjs";
import { healthTracker } from "./health.mjs";

export const PROVIDER_VERSION = "v1";

/** Map transport errors to contract status codes (for service telemetry). */
export function classifyErrorCode(message) {
  const text = String(message || "").toLowerCase();
  if (/timed out|timeout/.test(text)) return "timeout";
  if (/http 429|rate limit|rate_limit/.test(text)) return "rate_limited";
  if (/unreachable|econn|enotfound|socket/.test(text)) return "unavailable";
  if (/no json array|schema validation|no content|invalid/.test(text)) return "invalid_response";
  return "failed";
}

function toResults(items, transport, model, startedMs, fallbackUsed = false) {
  const latencyMs = Date.now() - startedMs;
  return items.map((item) => {
    // item.primary is already canonical or INVALID_LABEL (parse boundary).
    const invalid = item.primary === INVALID_LABEL;
    const candidates = invalid
      ? [INVALID_LABEL]
      : [...new Set([item.primary, ...item.categories])];
    // Uncalibrated: confidence stays null. Raw agreement count is evidence,
    // not a probability — calibration happens in the eval harness.
    // `id` rides alongside the contract result (validators ignore extras)
    // so batch callers can reattach predictions to inputs.
    return {
      id: item.id,
      ...createResult({
        label: item.primary,
        confidence: null,
        scores: null,
        candidates,
        provider: "opencode",
        model: `${transport}:${model}`,
        latencyMs,
        version: PROVIDER_VERSION,
        fallbackUsed,
      }),
    };
  });
}

async function classifyViaHttp(items, prompt, config, startedMs) {
  let raw;
  try {
    raw = await runHttp({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.httpModel,
      prompt,
      timeoutMs: config.timeoutMs,
    });
  } catch (err) {
    err.classifyCode = classifyErrorCode(err.message);
    throw err;
  }
  const batchIds = new Set(items.map((b) => b.id));
  try {
    return toResults(parseBatchResponse(raw, batchIds), "http", config.httpModel, startedMs);
  } catch (err) {
    err.classifyCode = "invalid_response";
    throw err;
  }
}

async function classifyViaCli(items, prompt, config, startedMs) {
  const batchIds = new Set(items.map((b) => b.id));
  const health = healthTracker();
  const errors = [];
  let skipped = 0;
  for (const [index, model] of config.freeModels.entries()) {
    // Never wait on a dead model: cooled models are skipped, and when the
    // whole chain is cooled the batch fails fast for local-only fallback.
    if (!health.isAvailable(model)) {
      skipped += 1;
      continue;
    }
    try {
      const raw = runOpencode({ model, prompt, timeoutMs: config.timeoutMs });
      health.recordSuccess(model);
      return toResults(parseBatchResponse(raw, batchIds), "cli", model, startedMs, index > 0);
    } catch (err) {
      err.classifyCode = classifyErrorCode(err.message);
      health.recordFailure(model, err.classifyCode);
      errors.push(`${model}: ${err.message}`);
    }
  }
  const error = new Error(
    skipped > 0 && errors.length === 0
      ? `All configured models are in cooldown (${skipped} skipped). Retry later or fall back to local-only operation.`
      : `All configured models failed. ${errors.join(" | ")}`
  );
  error.classifyCode = "unavailable";
  throw error;
}

export function createOpenCodeProvider(overrides = {}) {
  const config = { ...resolveConfig(), ...overrides };
  const provider = {
    name: "opencode",
    version: PROVIDER_VERSION,
    config,
    /**
     * Classify one batch. Returns ranked results; items with no usable
     * model output are omitted (caller maps gaps to `unknown`).
     */
    async classifyBatch(items) {
      if (!items || items.length === 0) return [];
      const startedMs = Date.now();
      const prompt = buildPrompt(items);
      if (config.transport === "http") {
        return classifyViaHttp(items, prompt, config, startedMs);
      }
      return classifyViaCli(items, prompt, config, startedMs);
    },
  };
  assertProviderShape(provider);
  return provider;
}
