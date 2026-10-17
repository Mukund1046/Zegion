/** OOD scoring unit tests. Synthetic signals, no model I/O. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { softmax, scoreSignals, fitThreshold, evaluateThreshold, evaluateAnd } from "../classify/eval/ood.mjs";

const rows = (spec) => spec.map(([v, ood]) => ({ signals: { s: v }, isOod: ood }));

describe("ood scores", () => {
  it("softmax normalizes and peaks on the max", () => {
    const p = softmax([2, 1, 0]);
    assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(p[0] > p[1] && p[1] > p[2]);
  });

  it("scoreSignals derives margin, distance, msp, energy consistently", () => {
    const s = scoreSignals({ a: 0.8, b: 0.5, c: 0.1 });
    assert.equal(s.top1, "a");
    assert.equal(s.top2, "b");
    assert.ok(Math.abs(s.margin - 0.3) < 1e-9);
    assert.ok(Math.abs(s.minDistance - 0.2) < 1e-9);
    assert.ok(s.msp > 0 && s.msp < 1);
    assert.ok(Number.isFinite(s.energy));
  });
});

describe("threshold fitting", () => {
  const items = rows([[0.9, false], [0.8, false], [0.3, true], [0.2, true], [0.1, true]]);

  it("finds the max-F1 split on dev", () => {
    const fit = fitThreshold(items, "s", false);
    assert.ok(fit);
    assert.equal(fit.precision, 1);
    assert.equal(fit.recall, 1);
  });

  it("returns null with no usable scores", () => {
    assert.equal(fitThreshold([{ signals: {}, isOod: true }], "s", false), null);
  });

  it("evaluates a fixed threshold with head retention", () => {
    const r = evaluateThreshold(items, "s", 0.5, false);
    assert.equal(r.precision, 1);
    assert.equal(r.recall, 1);
    assert.equal(r.headRetained, 1);
    assert.equal(r.falseOod, 0);
  });
});

describe("AND combinations", () => {
  it("requires both rules to fire", () => {
    const items = [
      { signals: { a: 1, b: 1 }, isOod: true },
      { signals: { a: 1, b: 0 }, isOod: false },
      { signals: { a: 0, b: 1 }, isOod: false },
    ];
    const r = evaluateAnd(
      items,
      { key: "a", higherIsOod: true, threshold: 1 },
      { key: "b", higherIsOod: true, threshold: 1 }
    );
    assert.equal(r.predicted, 1);
    assert.equal(r.precision, 1);
    assert.equal(r.headRetained, 1);
  });
});
