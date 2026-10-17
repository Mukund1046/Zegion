/** Production-audit workflow unit tests. Offline, fixture-driven. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tallyData, AUDIT_VERDICTS, stridePick } from "../classify/eval/audit-run.mjs";

const row = (id, verdict, source = "zen", label = "tool") => ({
  id,
  text: "sample",
  label,
  decision: { decisionSource: source },
  verdict,
  verdictNote: "note",
});

describe("audit verdicts", () => {
  it("accepts exactly the four verdict states", () => {
    assert.deepEqual([...AUDIT_VERDICTS].sort(), ["ambiguous", "correct", "insufficient-context", "wrong"]);
  });

  it("tallies rates and groups wrong rows for pattern analysis", () => {
    const report = tallyData({
      rows: [
        row("a", "correct"),
        row("b", "wrong", "local", "technique"),
        row("c", "ambiguous"),
        row("d", null),
      ],
    });
    assert.equal(report.total, 4);
    assert.equal(report.pending, 1);
    assert.equal(report.judged, 3);
    assert.deepEqual(report.counts, { correct: 1, wrong: 1, ambiguous: 1, "insufficient-context": 0 });
    assert.equal(report.wrong.length, 1);
    assert.equal(report.wrong[0].id, "b");
    assert.equal(report.bySource.local.wrong, 1);
    assert.equal(report.byLabel.technique.wrong, 1);
  });

  it("rejects invalid verdicts loudly", () => {
    assert.throws(() => tallyData({ rows: [row("a", "maybe")] }), /invalid verdict/);
  });
});

describe("stratified sampling", () => {
  it("stride-picks deterministically across strata", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    assert.deepEqual(stridePick(ids, 3), ["a", "c", "e"]);
    assert.deepEqual(stridePick(ids, 3), stridePick(ids, 3));
    assert.deepEqual(stridePick(["a"], 5), ["a"]);
  });
});
