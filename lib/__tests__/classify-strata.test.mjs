/** Strata partition unit tests. Synthetic rows, no model I/O. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { headLabels, referenceOf, stratumOf, partition } from "../classify/eval/strata.mjs";

const row = (id, split, silver, audit) => ({
  id,
  split,
  silverCategory: silver,
  audit: audit ? { status: "audited", label: audit } : { status: "pending", label: null },
});

describe("strata", () => {
  it("prefers audit labels over silver", () => {
    assert.equal(referenceOf(row("a", "dev", "tool", "launch")), "launch");
    assert.equal(referenceOf(row("b", "dev", "tool", null)), "tool");
  });

  it("splits head refs to B and other/unknown/uncertain to C", () => {
    const heads = new Set(["tool"]);
    assert.equal(stratumOf("tool", heads), "B");
    for (const s of ["other", "unknown", "uncertain"]) assert.equal(stratumOf(s, heads), "C");
    assert.equal(stratumOf("unclassified", heads), "B-other");
  });

  it("partitions dev/holdout without overlap", () => {
    const rows = [
      row("a", "dev", "tool", "tool"),
      row("b", "holdout", "other", "other"),
      row("c", "holdout", "tool", "launch"),
    ];
    const p = partition(rows);
    assert.equal(p.A.length, 3);
    assert.equal(p.dev.length, 1);
    assert.equal(p.holdout.length, 2);
    assert.ok(p.B.some((r) => r.id === "a"));
    assert.ok(p.C.some((r) => r.id === "b"));
    assert.ok(p.byClass.get("launch").some((r) => r.id === "c"));
  });

  it("head labels exclude the four states", () => {
    const heads = headLabels();
    for (const s of ["other", "unclassified", "unknown", "uncertain"]) {
      assert.ok(!heads.has(s), s);
    }
    assert.ok(heads.has("tool"));
  });
});
