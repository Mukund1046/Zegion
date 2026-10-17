/** Architecture freeze drift guards. Fail loudly on silent version drift. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTaxonomy } from "../classify/taxonomy.mjs";
import { CASCADE_VERSION } from "../classify/cascade/cascade.mjs";
import { THIN_TOKEN_CUTOFF } from "../classify/cascade/evidence.mjs";
import { DEFAULT_FREE_MODELS } from "../classify/opencode/config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLASSIFY = join(HERE, "..", "classify");

describe("architecture freeze", () => {
  it("pins taxonomy, cascade, evidence cutoff, and model chain versions", () => {
    assert.equal(getTaxonomy().version, "experimental-001");
    assert.equal(CASCADE_VERSION, "v1");
    assert.equal(THIN_TOKEN_CUTOFF, 2);
    assert.deepEqual(DEFAULT_FREE_MODELS, [
      "opencode/big-pickle",
      "opencode/mimo-v2.6-flash-free",
      "opencode/nemotron-3-ultra-free",
      "opencode/ling-3.0-flash-fin-free",
    ]);
  });

  it("pins bands and gates versions", () => {
    const bands = JSON.parse(readFileSync(join(CLASSIFY, "cascade", "bands.json"), "utf8"));
    const gates = JSON.parse(readFileSync(join(CLASSIFY, "cascade", "regex-gates.json"), "utf8"));
    assert.equal(bands.version, "v1");
    assert.equal(gates.version, "v1");
    assert.deepEqual(gates.terminal, []);
  });

  it("pins gold artifact provenance requirements", () => {
    const meta = JSON.parse(
      readFileSync(join(CLASSIFY, "local", "artifacts", "gold", "metadata.json"), "utf8")
    );
    assert.equal(meta.labelSource, "gold-audited");
    assert.equal(meta.taxonomyVersion, "experimental-001");
  });
});
