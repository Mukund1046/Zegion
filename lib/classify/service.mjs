/**
 * Classification service — the single boundary between callers and providers.
 *
 * `classifyBatch(items, {provider}) → {results, telemetry}`
 *
 * Providers are interchangeable (regex, local-ml, opencode, and future
 * groq/local-llm): the caller never branches on backend. The service
 * performs NO routing, NO thresholds, NO cascade — it executes exactly
 * one provider and observes. Routing is a Phase-3 decision built on
 * measured calibration, and this function must stay routing-free
 * (pinned by unit test).
 *
 * Telemetry carries counts only — never raw bookmark text.
 */
import { createRegexProvider } from "./regex.mjs";
import { createLocalMLProvider } from "./local/provider.mjs";
import { createOpenCodeProvider } from "./opencode/provider.mjs";
import { createCascadeProvider } from "./cascade/provider.mjs";
import { INVALID_LABEL } from "./opencode/parse.mjs";
import { assertProviderShape } from "./contract.mjs";

export const SERVICE_VERSION = "v1";

const BUILDERS = {
  regex: () => createRegexProvider(),
  "local-ml": (options) => createLocalMLProvider(options),
  opencode: (options) => createOpenCodeProvider(options),
  cascade: (options) => createCascadeProvider(options),
};

export function listProviders() {
  return Object.keys(BUILDERS);
}

/**
 * @param {{id: string, text?: string, authorHandle?: string, links?: string[]}[]} items
 * @param {{provider?: string|object, providerOptions?: Record<string, unknown>}} options
 *   provider is a registered name, or a provider object (duck-typed, used
 *   by tests and the future cascade) — either way it is executed, never routed.
 */
export async function classifyBatch(items, options = {}) {
  const startedMs = Date.now();
  const requested = options.provider || "local-ml";
  let provider;
  if (typeof requested === "string") {
    const build = BUILDERS[requested];
    if (!build) throw new Error(`Unknown classification provider: ${requested}`);
    provider = build(options.providerOptions || {});
  } else {
    assertProviderShape(requested);
    provider = requested;
  }

  const telemetry = {
    service: SERVICE_VERSION,
    provider: provider.name,
    model: null,
    items: items.length,
    classified: 0,
    abstained: 0,
    unknown: 0,
    other: 0,
    uncertain: 0,
    invalid: 0,
    failures: 0,
    timeouts: 0,
    fallbackUsed: 0,
    latencyMs: 0,
    errorCode: null,
  };

  let results;
  try {
    results = await provider.classifyBatch(items);
  } catch (err) {
    telemetry.failures = items.length;
    telemetry.errorCode = err.classifyCode || "failed";
    if (telemetry.errorCode === "timeout") telemetry.timeouts = items.length;
    telemetry.latencyMs = Date.now() - startedMs;
    return { results: [], telemetry };
  }

  telemetry.latencyMs = Date.now() - startedMs;
  telemetry.model = results.length > 0 ? results[0].model : null;
  const returned = new Set();
  for (const r of results) {
    returned.add(r.id);
    if (r.fallbackUsed) telemetry.fallbackUsed += 1;
    if (r.label === INVALID_LABEL) {
      telemetry.invalid += 1;
    } else if (r.label === "unknown") {
      telemetry.unknown += 1;
    } else if (r.label === "other") {
      telemetry.other += 1;
    } else if (r.label === "uncertain") {
      telemetry.uncertain += 1;
    } else {
      telemetry.classified += 1;
    }
  }
  // Gaps (provider omitted the item) count as abstained — the provider
  // declined to commit, which is observable and distinct from `unknown`.
  telemetry.abstained = items.length - returned.size;
  return { results, telemetry };
}
