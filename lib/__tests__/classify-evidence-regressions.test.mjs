/**
 * Regression tests for the five audited production errors
 * (40-row audit of run-2026-09-29T08-18-49) plus no-harm guards.
 * Each test mirrors one error's evidence through route().
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { route, terminalMap } from "../classify/cascade/cascade.mjs";

const bands = {
  version: "test",
  fallback: "arbitration",
  classes: {
    tool: { mode: "banded", highAt: 0.1, abstainBelow: 0.02, support: 20 },
    technique: { mode: "banded", highAt: 0.1, abstainBelow: 0.02, support: 20 },
    design: { mode: "banded", highAt: 0.1, abstainBelow: 0.02, support: 20 },
  },
};
const config = { terminalLabels: terminalMap({ terminal: [] }), bands };
const ev = (overrides = {}) => ({
  regexLabel: null,
  localLabel: "design",
  localMargin: 0.01,
  localCandidates: ["design", "technique"],
  zenLabel: null,
  zenStatus: "success",
  contentFree: false,
  thinEvidence: false,
  tutorialCue: null,
  ...overrides,
});

describe("audited-error regressions", () => {
  it("error 1: bare link becomes unknown, not other", () => {
    const d = route(ev({ contentFree: true, localLabel: "opinion", zenLabel: "other" }), config);
    assert.equal(d.label, "unknown");
    assert.equal(d.provenance.decisionSource, "evidence");
    assert.equal(d.provenance.decisionReason, "content-free");
    assert.equal(d.provenance.zenRequired, false);
  });

  it("error 2: thin agreement becomes uncertain, not a confirmed label", () => {
    const d = route(ev({ thinEvidence: true, localLabel: "design", localMargin: 0.2, zenLabel: "design" }), config);
    assert.equal(d.label, "uncertain");
    assert.equal(d.provenance.decisionReason, "thin-evidence");
    assert.equal(d.provenance.zenRequired, false);
  });

  it("errors 3+4: tutorial evidence routes toward technique", () => {
    // Tie-break: local technique vs zen education with an explicit cue.
    const tie = route(
      ev({ localLabel: "technique", localMargin: 0.02, localCandidates: ["technique", "education"], zenLabel: "education", tutorialCue: "step-by-step" }),
      config
    );
    assert.equal(tie.label, "technique");
    // Override: both sides agree design, but the cue plus ranked
    // technique support overturns the agreement.
    const over = route(
      ev({ localMargin: 0.02, localCandidates: ["design", "technique"], zenLabel: "design", tutorialCue: "here's the tutorial" }),
      config
    );
    assert.equal(over.label, "technique");
    assert.equal(over.provenance.decisionReason, "tutorial-evidence-override");
  });

  it("error 5 (known limitation): high-band rich-text accept is unchanged", () => {
    // A built-utility post with many tokens and no tutorial cue still
    // accepts the high-band local label. Fixing tool-vs-technique here
    // needs representation work, not routing — this pins current behavior.
    const d = route(ev({ localLabel: "technique", localMargin: 0.2, localCandidates: ["technique", "tool"] }), config);
    assert.equal(d.label, "technique");
    assert.equal(d.provenance.decisionSource, "local");
  });
});

describe("no-harm guards", () => {
  it("tutorial cue without ranked technique support changes nothing", () => {
    const d = route(
      ev({ localMargin: 0.02, localCandidates: ["design", "launch"], zenLabel: "design", tutorialCue: "tips" }),
      config
    );
    assert.equal(d.label, "design");
    assert.equal(d.provenance.decisionSource, "agreement");
  });

  it("informative posts never trigger evidence short-circuits", () => {
    const d = route(
      ev({ localLabel: "tool", localMargin: 0.2, localCandidates: ["tool", "launch"], contentFree: false, thinEvidence: false, tutorialCue: null }),
      config
    );
    assert.equal(d.label, "tool");
    assert.equal(d.provenance.decisionSource, "local");
  });

  it("content-free check does not swallow real agreement", () => {
    const d = route(
      ev({ localLabel: "launch", localMargin: 0.02, localCandidates: ["launch", "tool"], zenLabel: "launch", contentFree: false, thinEvidence: false }),
      config
    );
    assert.equal(d.label, "launch");
    assert.equal(d.provenance.decisionSource, "agreement");
  });
});
