/** Evidence-signal unit tests: content-free, thin-evidence, tutorial cues. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evidenceTokens,
  isContentFree,
  isThinEvidence,
  detectTutorialIntent,
  THIN_TOKEN_CUTOFF,
} from "../classify/cascade/evidence.mjs";

describe("evidence signals", () => {
  it("strips URLs, mentions, and noise before counting", () => {
    assert.deepEqual(evidenceTokens("https://t.co/abc @user!"), []);
    assert.deepEqual(evidenceTokens("Peak Branding @variant01labs"), ["peak", "branding"]);
    assert.deepEqual(evidenceTokens("--sref 2620778401"), ["sref"]);
  });

  it("detects content-free input", () => {
    assert.equal(isContentFree("https://t.co/bfIzkR2MNv"), true);
    assert.equal(isContentFree("🍦"), true);
    assert.equal(isContentFree("Peak Branding"), false);
  });

  it("thin-evidence cutoff is the measured K=2", () => {
    assert.equal(THIN_TOKEN_CUTOFF, 2);
    assert.equal(isThinEvidence("--sref 2620778401"), true);
    assert.equal(isThinEvidence("Peak Branding"), true);
    assert.equal(isThinEvidence("Peak Branding portfolio work share"), false);
    // Content-free has its own rule and is never merely "thin".
    assert.equal(isThinEvidence("https://t.co/abc"), false);
  });

  it("detects explicit instructional framing only", () => {
    assert.equal(detectTutorialIntent("here's the tutorial for animations"), "tutorial");
    assert.ok(detectTutorialIntent("a full step-by-step breakdown")?.includes("step-by-step"));
    assert.ok(detectTutorialIntent("how I built this")?.includes("how i built"));
    assert.equal(detectTutorialIntent("beautiful branding work"), null);
    assert.equal(detectTutorialIntent("a tool for building things"), null);
  });
});
