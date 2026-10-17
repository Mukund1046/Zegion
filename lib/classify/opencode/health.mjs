/**
 * Zen provider health: per-model cooldown + circuit state.
 *
 * Justified by measured evidence (mimo-v2.5 hard failure, lightning
 * trivial-probe timeouts): free-tier models die and stall independently
 * of the application. The classifier must never sit repeatedly waiting
 * for a dead model.
 *
 * Model: consecutive failures trigger escalating cooldowns; success
 * resets. When every configured model is cooled, the provider fails
 * fast (callers fall back to local-only operation) instead of burning
 * timeouts. Pure logic with injectable clock — fully unit-testable.
 */

export const DEFAULT_COOLDOWN_MS = 60_000;
export const MAX_COOLDOWN_MS = 15 * 60_000;

/** Cooldown for N consecutive failures (escalating, capped). */
export function cooldownForFailures(consecutiveFailures, baseMs = DEFAULT_COOLDOWN_MS, maxMs = MAX_COOLDOWN_MS) {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(maxMs, baseMs * 2 ** (consecutiveFailures - 1));
}

export function createHealthTracker({ now = () => Date.now(), baseMs = DEFAULT_COOLDOWN_MS, maxMs = MAX_COOLDOWN_MS } = {}) {
  /** model -> {consecutiveFailures, cooledUntil, lastError} */
  const state = new Map();

  const entry = (model) => {
    if (!state.has(model)) state.set(model, { consecutiveFailures: 0, cooledUntil: 0, lastError: null });
    return state.get(model);
  };

  return {
    recordSuccess(model) {
      const e = entry(model);
      e.consecutiveFailures = 0;
      e.cooledUntil = 0;
      e.lastError = null;
    },
    recordFailure(model, errorCode = "failed") {
      const e = entry(model);
      e.consecutiveFailures += 1;
      e.cooledUntil = now() + cooldownForFailures(e.consecutiveFailures, baseMs, maxMs);
      e.lastError = errorCode;
    },
    /** True when the model may be attempted right now. */
    isAvailable(model, at = now()) {
      const e = state.get(model);
      if (!e) return true;
      return at >= e.cooledUntil;
    },
    /** Milliseconds until the model may be retried (0 = now). */
    retryInMs(model, at = now()) {
      const e = state.get(model);
      if (!e) return 0;
      return Math.max(0, e.cooledUntil - at);
    },
    cooledModels(at = now()) {
      return [...state.keys()].filter((m) => !this.isAvailable(m, at));
    },
    snapshot(at = now()) {
      const models = {};
      for (const [model, e] of state) {
        models[model] = {
          consecutiveFailures: e.consecutiveFailures,
          cooled: at < e.cooledUntil,
          retryInMs: Math.max(0, e.cooledUntil - at),
          lastError: e.lastError,
        };
      }
      return { at, models };
    },
    reset() {
      state.clear();
    },
  };
}

/**
 * Process-lifetime singleton so cooldowns persist across batches within a
 * job run. Reset between jobs/tests via resetHealth().
 */
let singleton = null;

export function healthTracker() {
  if (!singleton) singleton = createHealthTracker();
  return singleton;
}

export function resetHealth() {
  singleton = null;
}
