/** Service boundary + contract-extension unit tests. Offline, no model I/O. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  STATUSES,
  createResult,
  findViolations,
} from "../classify/contract.mjs";
import { classifyBatch, listProviders } from "../classify/service.mjs";
import { createRegexProvider } from "../classify/regex.mjs";
import { redactSecrets } from "../classify/opencode/cli.mjs";

describe("contract extension", () => {
  it("fills versions, status, and nulls by default", () => {
    const r = createResult({ label: "tool", provider: "p", model: "m" });
    assert.equal(r.taxonomyVersion, "experimental-001");
    assert.equal(r.normalizationVersion, "v0-raw");
    assert.equal(r.status, STATUSES.SUCCESS);
    assert.equal(r.errorCode, null);
    assert.equal(r.abstention, null);
    assert.deepEqual(findViolations(r), []);
  });

  it("rejects bad status, errorCode, and abstention shapes", () => {
    const base = createResult({ label: "tool", provider: "p", model: "m" });
    assert.ok(findViolations({ ...base, status: "bogus" }).includes("status-invalid"));
    assert.ok(findViolations({ ...base, errorCode: 42 }).includes("errorCode-invalid"));
    assert.ok(findViolations({ ...base, abstention: { nope: true } }).includes("abstention-invalid"));
    assert.deepEqual(
      findViolations({ ...base, abstention: { reason: "low-margin", topScore: 0.7, secondScore: 0.69, margin: 0.01 } }),
      []
    );
  });
});

describe("regex provider", () => {
  it("emits contract results for rule hits and omits the rest", async () => {
    const provider = createRegexProvider();
    assert.equal(provider.name, "regex");
    const results = await provider.classifyBatch([
      { id: "a", text: "fixing a security vulnerability CVE-2024", links: [] },
      { id: "b", text: "just having lunch", links: [] },
    ]);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, "a");
    assert.equal(results[0].label, "security");
    assert.equal(results[0].confidence, null);
  });
});

describe("classification service", () => {
  it("lists the registered providers including cascade", () => {
    assert.deepEqual(listProviders().sort(), ["cascade", "local-ml", "opencode", "regex"]);
  });

  it("rejects unknown providers without side effects", async () => {
    await assert.rejects(() => classifyBatch([{ id: "a", text: "x" }], { provider: "groq" }), /Unknown classification provider/);
  });

  it("passes provider output through unmodified (no routing)", async () => {
    const { results, telemetry } = await classifyBatch(
      [
        { id: "a", text: "GitHub repo cli tool release", links: [] },
        { id: "b", text: "lunch diary entry", links: [] },
      ],
      { provider: "regex" }
    );
    assert.equal(telemetry.provider, "regex");
    assert.equal(telemetry.items, 2);
    // Abstained = provider omitted; classified + abstained covers all items.
    assert.equal(telemetry.classified + telemetry.abstained, 2);
    assert.equal(telemetry.failures, 0);
    assert.ok(telemetry.latencyMs >= 0);
    for (const r of results) assert.deepEqual(findViolations(r), []);
  });

  it("counts invalid labels separately and never propagates them silently", async () => {
    const { telemetry } = await classifyBatch(
      [{ id: "a", text: "x".repeat(10), links: [] }],
      { provider: "regex" }
    );
    // Regex emits only taxonomy-validated labels.
    assert.equal(telemetry.invalid, 0);
  });

  it("records batch failures with error codes and empty results", async () => {
    const failing = {
      name: "boom",
      version: "0",
      classifyBatch: async () => {
        const err = new Error("All configured models failed");
        err.classifyCode = "unavailable";
        throw err;
      },
    };
    const { results, telemetry } = await classifyBatch(
      [{ id: "a", text: "x" }],
      { provider: failing }
    );
    assert.deepEqual(results, []);
    assert.equal(telemetry.failures, 1);
    assert.equal(telemetry.timeouts, 0);
    assert.equal(telemetry.errorCode, "unavailable");
    assert.equal(telemetry.provider, "boom");
  });

  it("maps timeout failures to timeout telemetry", async () => {
    const slow = {
      name: "slow",
      version: "0",
      classifyBatch: async () => {
        const err = new Error("opencode timed out after 180s");
        err.classifyCode = "timeout";
        throw err;
      },
    };
    const { telemetry } = await classifyBatch([{ id: "a", text: "x" }], { provider: slow });
    assert.equal(telemetry.failures, 1);
    assert.equal(telemetry.timeouts, 1);
    assert.equal(telemetry.errorCode, "timeout");
  });
});

describe("secret redaction", () => {
  it("redacts provider keys and bearer tokens from child stderr", () => {
    const out = redactSecrets("oops sk-abcdef1234567890 and Bearer mytoken1234567890 done");
    assert.doesNotMatch(out, /sk-abcdef/);
    assert.doesNotMatch(out, /mytoken/);
    assert.match(out, /REDACTED/);
  });
});
