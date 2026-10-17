/** Cascade provider unit tests. Stubbed backends — no model I/O. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCascadeProvider } from "../classify/cascade/provider.mjs";
import { requiresZen } from "../classify/cascade/cascade.mjs";

const bands = {
  version: "test",
  fallback: "arbitration",
  classes: {
    tool: { mode: "banded", highAt: 0.1, abstainBelow: 0.02, support: 20 },
    opinion: { mode: "arbitration-only", reason: "thin", support: 3 },
  },
};
const gates = { version: "test", terminal: [] };

const stubResult = (id, label, scores) => ({
  id,
  label,
  confidence: null,
  scores,
  candidates: Object.keys(scores),
  provider: "stub",
  model: "stub",
  latencyMs: 1,
  version: "0",
  fallbackUsed: false,
  taxonomyVersion: "experimental-001",
  normalizationVersion: "v0-raw",
  status: "success",
  errorCode: null,
  abstention: null,
});

const stubProvider = (name, fn) => ({ name, version: "0", classifyBatch: fn });
const regexNone = stubProvider("regex", async (items) => []);
const localTool = (margin) => stubProvider("local", async (items) =>
  items.map((b) => stubResult(b.id, "tool", { tool: 0.5 + margin, launch: 0.5 }))
);

describe("requiresZen pre-check", () => {
  const config = { terminalLabels: new Map(), bands };
  it("is false for high-band local without terminal gates", () => {
    assert.equal(requiresZen({ regexLabel: null, localLabel: "tool", localMargin: 0.2 }, config), false);
  });
  it("is true for arbitration-band and unsupported classes", () => {
    assert.equal(requiresZen({ regexLabel: null, localLabel: "tool", localMargin: 0.05 }, config), true);
    assert.equal(requiresZen({ regexLabel: null, localLabel: "opinion", localMargin: 0.99 }, config), true);
  });
});

describe("cascade provider", () => {
  it("accepts high-band local without calling Zen", async () => {
    let zenCalls = 0;
    const zen = stubProvider("zen", async (items) => {
      zenCalls += 1;
      return items.map((b) => stubResult(b.id, "tool", { tool: 1 }));
    });
    const provider = createCascadeProvider({
      bands,
      gates,
      regex: regexNone,
      local: localTool(0.2),
      zen,
    });
    const results = await provider.classifyBatch([{ id: "a", text: "Building a useful open source developer tool with documentation" }]);
    assert.equal(results.length, 1);
    assert.equal(results[0].label, "tool");
    assert.equal(results[0].provider, "cascade");
    assert.equal(zenCalls, 0);
    assert.equal(results[0].decision.decisionSource, "local");
    assert.equal(results[0].decision.zenRequired, false);
  });

  it("batches only Zen-required items to Zen", async () => {
    let zenIds = [];
    const zen = stubProvider("zen", async (items) => {
      zenIds = items.map((b) => b.id);
      return items.map((b) => stubResult(b.id, "launch", { launch: 1 }));
    });
    const local = stubProvider("local", async (items) =>
      items.map((b) =>
        b.id === "hi"
          ? stubResult(b.id, "tool", { tool: 0.9, launch: 0.1 })
          : stubResult(b.id, "tool", { tool: 0.52, launch: 0.48 })
      )
    );
    const provider = createCascadeProvider({ bands, gates, regex: regexNone, local, zen });
    const results = await provider.classifyBatch([
      { id: "hi", text: "Building a useful open source developer tool with documentation" },
      { id: "lo", text: "Reviewing several competing developer tools for daily workflows" },
    ]);
    assert.deepEqual(zenIds, ["lo"]);
    const byId = new Map(results.map((r) => [r.id, r]));
    assert.equal(byId.get("hi").decision.zenRequired, false);
    assert.equal(byId.get("lo").decision.zenRequired, true);
    // Uncorroborated local/zen disagreement resolves to uncertain,
    // preserving both candidates instead of guessing.
    assert.equal(byId.get("lo").label, "uncertain");
    assert.equal(byId.get("lo").decision.arbitration, "unresolved");
  });

  it("degrades to unclassified with status on Zen failure", async () => {
    const zen = stubProvider("zen", async () => {
      const err = new Error("timeout");
      err.classifyCode = "timeout";
      throw err;
    });
    const provider = createCascadeProvider({
      bands,
      gates,
      regex: regexNone,
      local: localTool(0.01),
      zen,
    });
    const results = await provider.classifyBatch([{ id: "a", text: "Reviewing several competing developer tools for daily workflows" }]);
    assert.equal(results[0].label, "unclassified");
    assert.equal(results[0].status, "timeout");
    assert.equal(results[0].errorCode, "timeout");
  });

  it("registers under the service without routing changes", async () => {
    const { classifyBatch, listProviders } = await import("../classify/service.mjs");
    assert.ok(listProviders().includes("cascade"));
    const { results, telemetry } = await classifyBatch([{ id: "a", text: "GitHub repo tool" }], {
      provider: {
        name: "cascade-stub",
        version: "0",
        classifyBatch: async (items) => items.map((b) => stubResult(b.id, "tool", { tool: 1 })),
      },
    });
    assert.equal(results.length, 1);
    assert.equal(telemetry.provider, "cascade-stub");
  });
});
