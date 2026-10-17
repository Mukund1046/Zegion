/**
 * OpenCode provider configuration. Isolated from classifier logic so a
 * disappearing/rotating Zen model is an env edit, not a code change.
 *
 * - Free/keyless: CLI transport (`opencode run`), models tried in order.
 * - Keyed/paid: HTTP transport against an OpenAI-compatible endpoint.
 */
export const DEFAULT_FREE_MODELS = [
  "opencode/big-pickle",
  "opencode/mimo-v2.6-flash-free",
  "opencode/nemotron-3-ultra-free",
  "opencode/ling-3.0-flash-fin-free",
];

export function resolveConfig(env = process.env) {
  const freeModels = String(env.X_CLASSIFY_MODELS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    transport: env.OPENCODE_API_KEY ? "http" : "cli",
    baseUrl: env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1",
    apiKey: env.OPENCODE_API_KEY || "",
    httpModel: env.OPENCODE_MODEL || "opencode/big-pickle",
    freeModels: freeModels.length > 0 ? freeModels : DEFAULT_FREE_MODELS,
    batchSize: Math.max(1, Math.min(50, Number(env.X_CLASSIFY_BATCH) || 20)),
    timeoutMs: Number(env.X_CLASSIFY_TIMEOUT_MS) || 180000,
  };
}
