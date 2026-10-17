/**
 * Zegion classification contract — frozen interface for all providers.
 *
 * Four states that must never be conflated:
 * - `unclassified` — classification has not happened yet
 * - `unknown`      — attempted, but not enough evidence for any label
 * - `other`        — valid content that belongs to no current-taxonomy label
 * - `uncertain`    — competing predictions / insufficient confidence
 *
 * Confidence is a number in [0, 1] ONLY when it has been validated to
 * behave like a probability. Uncalibrated scores must be reported as
 * `confidence: null` with the raw margin kept in `scores`, never
 * presented as certainty.
 */

/** Classification states. Anything else is rejected by validateResult. */
export const STATES = Object.freeze({
  UNCLASSIFIED: "unclassified",
  UNKNOWN: "unknown",
  OTHER: "other",
  UNCERTAIN: "uncertain",
});

const STATE_VALUES = new Set(Object.values(STATES));

/** Result health. Provider failures live here — never as semantic labels. */
export const STATUSES = Object.freeze({
  SUCCESS: "success",
  ABSTAINED: "abstained",
  TIMEOUT: "timeout",
  RATE_LIMITED: "rate_limited",
  UNAVAILABLE: "unavailable",
  INVALID_RESPONSE: "invalid_response",
  FAILED: "failed",
});

const STATUS_VALUES = new Set(Object.values(STATUSES));

/**
 * @typedef {Object} Abstention
 * @property {string} reason            Machine-readable cause (e.g. "low-margin", "no-evidence", "disagreement")
 * @property {number|null} topScore     Best raw score, if any
 * @property {number|null} secondScore  Runner-up raw score, if any
 * @property {number|null} margin       topScore minus secondScore, if any
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {string} label            Canonical label, or one of the four states
 * @property {number|null} confidence  Validated probability in [0,1], or null if uncalibrated
 * @property {Record<string,number>|null} scores  Raw uncalibrated scores/margins (never shown as certainty)
 * @property {string[]} candidates     Ranked candidate labels (for disagreement detection)
 * @property {string} provider         Provider name (regex, local-ml, opencode, groq, local-llm, …)
 * @property {string} model            Model/artifact id behind the result
 * @property {number} latencyMs        Wall-clock time for this item's classification
 * @property {string} version          Provider/artifact version string
 * @property {boolean} fallbackUsed    True when this result came from a fallback path
 * @property {string} taxonomyVersion  Taxonomy version the label was produced under
 * @property {string} normalizationVersion  Text preprocessing version feeding the classifier
 * @property {string} status           One of STATUSES (failures live here, not in label)
 * @property {string|null} errorCode   Machine-readable failure cause, null on success
 * @property {Abstention|null} abstention  Present when the provider declined to commit
 */

/**
 * Build a well-formed result. Throws on contract violations so bad
 * providers fail loudly in eval instead of silently poisoning metrics.
 * @param {Partial<ClassificationResult> & {label: string}} fields
 * @returns {ClassificationResult}
 */
export function createResult(fields) {
  const result = {
    label: fields.label,
    confidence: fields.confidence ?? null,
    scores: fields.scores ?? null,
    candidates: fields.candidates ?? [fields.label],
    provider: fields.provider ?? "unknown",
    model: fields.model ?? "unknown",
    latencyMs: fields.latencyMs ?? 0,
    version: fields.version ?? "0",
    fallbackUsed: fields.fallbackUsed ?? false,
    taxonomyVersion: fields.taxonomyVersion ?? "experimental-001",
    normalizationVersion: fields.normalizationVersion ?? "v0-raw",
    status: fields.status ?? STATUSES.SUCCESS,
    errorCode: fields.errorCode ?? null,
    abstention: fields.abstention ?? null,
  };
  validateResult(result);
  return result;
}

/**
 * @param {ClassificationResult} result
 * @returns {string[]} list of violations (empty = valid)
 */
export function findViolations(result) {
  const problems = [];
  if (!result || typeof result !== "object") return ["not-an-object"];
  if (typeof result.label !== "string" || result.label.length === 0) {
    problems.push("label-missing");
  }
  if (result.confidence !== null) {
    if (typeof result.confidence !== "number" || !Number.isFinite(result.confidence)) {
      problems.push("confidence-not-finite");
    } else if (result.confidence < 0 || result.confidence > 1) {
      problems.push("confidence-out-of-range");
    }
  }
  if (!Array.isArray(result.candidates) || result.candidates.length === 0) {
    problems.push("candidates-empty");
  }
  if (typeof result.provider !== "string" || result.provider.length === 0) {
    problems.push("provider-missing");
  }
  if (typeof result.model !== "string" || result.model.length === 0) {
    problems.push("model-missing");
  }
  if (typeof result.latencyMs !== "number" || result.latencyMs < 0) {
    problems.push("latency-invalid");
  }
  if (typeof result.taxonomyVersion !== "string" || result.taxonomyVersion.length === 0) {
    problems.push("taxonomyVersion-missing");
  }
  if (typeof result.normalizationVersion !== "string" || result.normalizationVersion.length === 0) {
    problems.push("normalizationVersion-missing");
  }
  if (!STATUS_VALUES.has(result.status)) {
    problems.push("status-invalid");
  }
  if (result.errorCode !== null && (typeof result.errorCode !== "string" || result.errorCode.length === 0)) {
    problems.push("errorCode-invalid");
  }
  if (result.abstention !== null) {
    if (typeof result.abstention !== "object" || typeof result.abstention.reason !== "string") {
      problems.push("abstention-invalid");
    }
  }
  return problems;
}

/** @param {ClassificationResult} result throws on violation */
export function validateResult(result) {
  const problems = findViolations(result);
  if (problems.length > 0) {
    throw new Error(`Invalid ClassificationResult: ${problems.join(", ")}`);
  }
}

/**
 * @typedef {Object} ClassifierProvider
 * @property {string} name
 * @property {string} version
 * @property {(text: string, context?: Record<string, unknown>) => Promise<ClassificationResult[]>} classifyBatch
 *   Ranked candidates, best first. Empty array = no evidence (caller maps to `unknown`).
 */

/** @param {unknown} provider throws unless it satisfies the provider shape */
export function assertProviderShape(provider) {
  if (!provider || typeof provider !== "object") throw new Error("provider-not-an-object");
  const p = /** @type {Record<string, unknown>} */ (provider);
  if (typeof p.name !== "string" || p.name.length === 0) throw new Error("provider-name-missing");
  if (typeof p.version !== "string" || p.version.length === 0) {
    throw new Error("provider-version-missing");
  }
  if (typeof p.classifyBatch !== "function") throw new Error("provider-classifyBatch-missing");
}

/** True for terminal non-labels that route to review rather than facets. */
export function isNonLabel(label) {
  return label === STATES.UNCERTAIN || label === STATES.UNKNOWN;
}
