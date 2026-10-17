/** Cascade router unit tests. Fixture bands/gates — no gold data, no models. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { route, terminalMap, CASCADE_VERSION } from "../classify/cascade/cascade.mjs";

const bands = {
  version: "test",
  fallback: "arbitration",
  classes: {
    tool: { mode: "banded", highAt: 0.1, abstainBelow: 0.02, support: 20 },
    opinion: { mode: "arbitration-only", reason: "thin", support: 3 },
  },
};
const gates = terminalMap({ terminal: [{ ruleId: "regex-primary-security", label: "security" }] });
const emptyGates = terminalMap({ terminal: [] });

function ev(overrides = {}) {
  return {
    regexLabel: null,
    localLabel: "tool",
    localMargin: 0.05,
    localCandidates: ["tool", "launch"],
    zenLabel: null,
    zenStatus: "success",
    ...overrides,
  };
}

describe("cascade router", () => {
  it("accepts promoted terminal regex gates", () => {
    const d = route(ev({ regexLabel: "security" }), { terminalLabels: gates, bands });
    assert.equal(d.label, "security");
    assert.equal(d.provenance.decisionSource, "regex");
    assert.equal(d.provenance.regexRuleId, "regex-primary-security");
    assert.equal(d.provenance.zenRequired, false);
  });

  it("ignores unpromoted regex hits (evidence, not gates)", () => {
    const d = route(ev({ regexLabel: "tool", localMargin: 0.2, zenLabel: "tool" }), { terminalLabels: emptyGates, bands });
    assert.equal(d.label, "tool");
    assert.equal(d.provenance.decisionSource, "local");
    assert.equal(d.provenance.decisionReason, "margin-band");
  });

  it("accepts high-band local predictions without Zen", () => {
    const d = route(ev({ localMargin: 0.2 }), { terminalLabels: emptyGates, bands });
    assert.equal(d.provenance.decisionSource, "local");
    assert.equal(d.provenance.zenRequired, false);
    assert.equal(d.status, "success");
  });

  it("routes abstain-band local to Zen", () => {
    const d = route(ev({ localMargin: 0.01, zenLabel: "launch" }), { terminalLabels: emptyGates, bands });
    assert.equal(d.label, "launch");
    assert.equal(d.provenance.decisionSource, "zen");
    assert.equal(d.provenance.zenRequired, true);
  });

  it("accepts local-zen agreement with provenance", () => {
    const d = route(ev({ localMargin: 0.05, zenLabel: "tool" }), { terminalLabels: emptyGates, bands });
    assert.equal(d.label, "tool");
    assert.equal(d.provenance.decisionSource, "agreement");
    assert.equal(d.provenance.arbitration, "agreement");
  });

  it("accepts Zen other/unknown via capability rule", () => {
    const d = route(ev({ localMargin: 0.05, zenLabel: "other" }), { terminalLabels: emptyGates, bands });
    assert.equal(d.label, "other");
    assert.equal(d.provenance.decisionReason, "other-unknown-capability");
    assert.equal(d.provenance.arbitration, "zen_wins");
  });

  it("uses regex corroboration to break ties", () => {
    const localWin = route(ev({ regexLabel: "tool", localMargin: 0.05, zenLabel: "launch" }), { terminalLabels: emptyGates, bands });
    assert.equal(localWin.label, "tool");
    assert.equal(localWin.provenance.arbitration, "local_wins");
    const zenWin = route(ev({ regexLabel: "launch", localMargin: 0.05, zenLabel: "launch" }), { terminalLabels: emptyGates, bands });
    assert.equal(zenWin.label, "launch");
    assert.equal(zenWin.provenance.arbitration, "zen_wins");
    assert.equal(zenWin.provenance.decisionReason, "regex-corroborates-zen");
  });

  it("leaves unresolved disagreement as uncertain with both candidates", () => {
    const d = route(ev({ localMargin: 0.05, zenLabel: "design" }), { terminalLabels: emptyGates, bands });
    assert.equal(d.label, "uncertain");
    assert.equal(d.provenance.arbitration, "unresolved");
    assert.equal(d.provenance.localCandidate, "tool");
    assert.equal(d.provenance.zenCandidate, "design");
  });

  it("never turns Zen failure into a category", () => {
    const d = route(ev({ localMargin: 0.05, zenLabel: null, zenStatus: "timeout" }), { terminalLabels: emptyGates, bands });
    assert.equal(d.label, "unclassified");
    assert.equal(d.status, "timeout");
    assert.equal(d.errorCode, "timeout");
  });

  it("treats arbitration-only classes without invented thresholds", () => {
    const d = route(ev({ localLabel: "opinion", localMargin: 0.99, zenLabel: "opinion" }), { terminalLabels: emptyGates, bands });
    // opinion has no high band: even margin 0.99 must arbitrate, not accept.
    assert.equal(d.provenance.decisionSource, "agreement");
    assert.equal(d.provenance.zenRequired, true);
  });

  it("exposes version and full provenance on every decision", () => {
    assert.ok(CASCADE_VERSION.length > 0);
    const d = route(ev({ localMargin: 0.2 }), { terminalLabels: emptyGates, bands });
    for (const key of ["decisionSource", "decisionReason", "localMargin", "localCandidate", "zenCandidate", "regexRuleId", "arbitration", "zenRequired"]) {
      assert.ok(key in d.provenance, key);
    }
  });
});
