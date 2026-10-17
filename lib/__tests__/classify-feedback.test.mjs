/** Feedback loop + Zen health unit tests. Offline, no model I/O. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cooldownForFailures,
  createHealthTracker,
  resetHealth,
  healthTracker,
  DEFAULT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
} from "../classify/opencode/health.mjs";
import { decidePromotion } from "../classify/eval/promote.mjs";
import { meanVector } from "../classify/local/centroids.mjs";

describe("zen health cooldowns", () => {
  it("escalates cooldowns and caps them", () => {
    assert.equal(cooldownForFailures(0), 0);
    assert.equal(cooldownForFailures(1), DEFAULT_COOLDOWN_MS);
    assert.equal(cooldownForFailures(2), 2 * DEFAULT_COOLDOWN_MS);
    assert.ok(cooldownForFailures(100) <= MAX_COOLDOWN_MS);
  });

  it("cools models after failure and resets on success", () => {
    let now = 1000;
    const h = createHealthTracker({ now: () => now });
    assert.equal(h.isAvailable("m"), true);
    h.recordFailure("m", "timeout");
    assert.equal(h.isAvailable("m"), false);
    assert.ok(h.retryInMs("m") > 0);
    now += MAX_COOLDOWN_MS + 1;
    assert.equal(h.isAvailable("m"), true);
    h.recordFailure("m", "failed");
    h.recordSuccess("m");
    assert.equal(h.isAvailable("m"), true);
    assert.equal(h.retryInMs("m"), 0);
  });

  it("tracks failures per model independently", () => {
    const h = createHealthTracker({ now: () => 0 });
    h.recordFailure("a", "failed");
    assert.equal(h.isAvailable("a"), false);
    assert.equal(h.isAvailable("b"), true);
    assert.deepEqual(h.cooledModels(), ["a"]);
    const snap = h.snapshot();
    assert.equal(snap.models.a.consecutiveFailures, 1);
    assert.equal(snap.models.a.lastError, "failed");
    h.reset();
    assert.equal(h.isAvailable("a"), true);
  });

  it("singleton resets cleanly between jobs", () => {
    healthTracker().recordFailure("m", "failed");
    assert.equal(healthTracker().isAvailable("m"), false);
    resetHealth();
    assert.equal(healthTracker().isAvailable("m"), true);
  });
});

describe("weighted centroids", () => {
  it("pulls the centroid toward higher-weighted samples", () => {
    const gold = [10, 0];
    const zen = [0, 10];
    const unweighted = meanVector([gold, zen]);
    const weighted = meanVector([gold, zen], [1, 0.5]);
    assert.deepEqual(unweighted, [5, 5]);
    assert.ok(Math.abs(weighted[0] - 20 / 3) < 1e-9);
    assert.ok(Math.abs(weighted[1] - 10 / 3) < 1e-9);
  });

  it("ignores zero-total weights safely", () => {
    assert.deepEqual(meanVector([[1, 2]], [0]), [0, 0]);
  });
});

describe("promotion gate", () => {
  const base = { accuracy: 0.4, macroF1: 0.5, holdoutAccuracy: 0.3 };

  it("promotes on no-regression across all three checks", () => {
    const { verdict, checks } = decidePromotion({ ...base }, { ...base });
    assert.equal(verdict, "PROMOTE");
    assert.ok(checks.every((c) => c.ok));
  });

  it("rejects on any single regression", () => {
    assert.equal(decidePromotion({ ...base, holdoutAccuracy: 0.29 }, base).verdict, "REJECT");
    assert.equal(decidePromotion({ ...base, accuracy: 0.39 }, base).verdict, "REJECT");
    assert.equal(decidePromotion({ ...base, macroF1: 0.49 }, base).verdict, "REJECT");
  });

  it("rejects when metrics are missing", () => {
    assert.equal(decidePromotion({ ...base, macroF1: null }, base).verdict, "REJECT");
  });
});
