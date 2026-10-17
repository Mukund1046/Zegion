/** Calibration analysis unit tests. Pure functions, synthetic data. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reliabilityBins,
  checkMonotonic,
  selectiveCurve,
  fitPlatt,
  applyPlatt,
  brierNaive,
} from "../classify/eval/calibration.mjs";

const perfect = [
  { topScore: 0.9, margin: 0.5, correct: true },
  { topScore: 0.8, margin: 0.4, correct: true },
  { topScore: 0.3, margin: 0.1, correct: false },
  { topScore: 0.2, margin: 0.05, correct: false },
];

describe("reliability bins", () => {
  it("computes per-bin precision and skips empty bins", () => {
    const bins = reliabilityBins(perfect, "topScore", 2);
    assert.equal(bins.length, 2);
    assert.equal(bins[1].precision, 1);
    assert.equal(bins[0].precision, 0);
  });

  it("returns empty for no usable scores", () => {
    assert.deepEqual(reliabilityBins([], "topScore"), []);
    assert.deepEqual(reliabilityBins([{ topScore: null, correct: true }], "topScore"), []);
  });
});

describe("monotonicity check", () => {
  it("passes perfectly ordered bins", () => {
    const { monotonic, violations } = checkMonotonic(reliabilityBins(perfect, "margin", 2));
    assert.equal(monotonic, true);
    assert.equal(violations, 0);
  });

  it("flags inversions instead of hiding them", () => {
    const mixed = [
      { topScore: 0.9, margin: 0.1, correct: false },
      { topScore: 0.2, margin: 0.05, correct: true },
    ];
    const { monotonic, violations } = checkMonotonic(reliabilityBins(mixed, "topScore", 2));
    assert.equal(monotonic, false);
    assert.ok(violations >= 1);
  });
});

describe("selective curve", () => {
  it("shows perfect precision at strict fractions on separable data", () => {
    const curve = selectiveCurve(perfect, "margin");
    const strict = curve[0];
    assert.equal(strict.precision, 1);
    const full = curve[curve.length - 1];
    assert.equal(full.coverage, 1);
    assert.equal(full.precision, 0.5);
  });
});

describe("platt scaling", () => {
  it("refuses to fit below the sample minimum", () => {
    const r = fitPlatt([{ topScore: 0.9, correct: true }], 50);
    assert.equal(r.fitted, false);
    assert.match(r.reason, /only 1 samples/);
  });

  it("fits a monotone mapper on separable data", () => {
    const samples = [];
    for (let i = 0; i < 30; i += 1) {
      samples.push({ topScore: 0.7 + i / 100, correct: true });
      samples.push({ topScore: 0.2 + i / 200, correct: false });
    }
    const r = fitPlatt(samples, 50);
    assert.equal(r.fitted, true);
    assert.ok(applyPlatt(0.9, r) > applyPlatt(0.2, r));
    assert.ok(r.brierInSample < 0.25);
  });

  it("brierNaive returns null with no usable scores", () => {
    assert.equal(brierNaive([{ topScore: 5, correct: true }]), null);
    assert.equal(brierNaive([]), null);
  });
});
