import test from "node:test";
import assert from "node:assert/strict";
import { isDesktopRequestAllowed } from "../desktop-origin-guard.mjs";

const localOrigin = "http://127.0.0.1:49152";

test("allows same-origin API writes from the desktop renderer", () => {
  assert.equal(isDesktopRequestAllowed({
    origin: localOrigin,
    requestOrigin: localOrigin,
    method: "POST",
    fetchSite: "same-origin",
  }), true);
});

test("allows a same-host write when Next reconstructed a stale request origin", () => {
  assert.equal(isDesktopRequestAllowed({
    origin: localOrigin,
    requestOrigin: "http://localhost:49152",
    requestHost: "127.0.0.1:49152",
    method: "POST",
    fetchSite: "same-origin",
  }), true);
});

test("rejects cross-origin reads and writes", () => {
  for (const method of ["GET", "POST"]) {
    assert.equal(isDesktopRequestAllowed({
      origin: "https://attacker.invalid",
      requestOrigin: localOrigin,
      method,
      fetchSite: "cross-site",
    }), false);
  }
});

test("rejects writes without a matching Origin", () => {
  assert.equal(isDesktopRequestAllowed({
    origin: null,
    requestOrigin: localOrigin,
    method: "POST",
    fetchSite: "same-origin",
  }), false);
});

test("does not accept a different host or protocol through the Host fallback", () => {
  for (const [origin, requestOrigin] of [
    ["https://attacker.invalid", localOrigin],
    ["https://127.0.0.1:49152", localOrigin],
  ]) {
    assert.equal(isDesktopRequestAllowed({
      origin,
      requestOrigin,
      requestHost: "127.0.0.1:49152",
      method: "POST",
      fetchSite: "same-origin",
    }), false);
  }
});

test("allows local health reads without Origin", () => {
  assert.equal(isDesktopRequestAllowed({
    origin: null,
    requestOrigin: localOrigin,
    method: "GET",
    fetchSite: null,
  }), true);
});
