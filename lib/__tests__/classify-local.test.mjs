/** Local ML head unit tests. Pure math + artifact schema — no model load. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cosine, dot, meanVector, buildCentroids, rankVector } from "../classify/local/centroids.mjs";
import { createLocalMLProvider, loadArtifacts } from "../classify/local/provider.mjs";
import { assertProviderShape } from "../classify/contract.mjs";
import { getTaxonomy } from "../classify/taxonomy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = join(HERE, "..", "classify", "local");

describe("centroid math", () => {
  it("cosine is 1 for identical vectors, 0 for orthogonal", () => {
    assert.equal(cosine([1, 0], [1, 0]), 1);
    assert.equal(cosine([1, 0], [0, 1]), 0);
    assert.equal(cosine([0, 0], [1, 0]), 0);
    assert.ok(Math.abs(dot([1, 2], [3, 4]) - 11) < 1e-9);
  });

  it("meanVector averages component-wise", () => {
    assert.deepEqual(meanVector([[1, 3], [3, 1]]), [2, 2]);
  });

  it("buildCentroids skips empty classes", () => {
    const c = buildCentroids({ a: [[1, 0]], b: [] });
    assert.deepEqual(Object.keys(c), ["a"]);
  });

  it("rankVector orders best-first with winner margin", () => {
    const ranked = rankVector([1, 0], { near: [1, 0], far: [0, 1] });
    assert.equal(ranked[0].label, "near");
    assert.equal(ranked[1].label, "far");
    assert.ok(Math.abs(ranked[0].margin - 1) < 1e-9);
    assert.equal(ranked[1].margin, 0);
  });
});

describe("local artifacts", () => {
  it("artifacts exist with matching schema and taxonomy labels", () => {
    const dir = join(LOCAL_DIR, "artifacts");
    assert.ok(existsSync(join(dir, "centroids.json")), "run build-centroids.mjs first");
    const { centroids, metadata, version } = loadArtifacts(dir);
    const taxonomy = getTaxonomy();
    const labels = Object.keys(centroids);
    assert.ok(labels.length > 0);
    for (const label of labels) {
      assert.ok(taxonomy.canonical.includes(label), `${label} not canonical`);
      assert.ok(Array.isArray(centroids[label]) && centroids[label].length > 0);
    }
    const dim = centroids[labels[0]].length;
    for (const label of labels) assert.equal(centroids[label].length, dim);
    assert.deepEqual([...metadata.labelSet].sort(), [...labels].sort());
    assert.equal(metadata.modelVersion, version);
    assert.equal(metadata.thresholds, null);
    // Reproducibility invariant: every artifact must declare its label
    // source, taxonomy version, and normalization version.
    assert.ok(metadata.labelSource, "labelSource required (gold|silver|silver-weighted)");
    assert.ok(metadata.taxonomyVersion, "taxonomyVersion required");
    assert.ok(metadata.normalizationVersion, "normalizationVersion required");
  });
});

describe("local provider", () => {
  it("satisfies the provider contract shape", () => {
    assertProviderShape(createLocalMLProvider());
  });
});

describe("gold-seeded artifacts", () => {
  const GOLD_DIR = join(LOCAL_DIR, "artifacts", "gold");
  const BENCH = join(HERE, "..", "classify", "eval", "dataset-benchmark-v1.json");

  it("gold artifacts declare gold provenance and taxonomy version", () => {
    const { metadata } = loadArtifacts(GOLD_DIR);
    assert.equal(metadata.labelSource, "gold-audited");
    assert.equal(metadata.taxonomyVersion, "experimental-001");
    assert.ok(metadata.normalizationVersion);
    assert.ok(metadata.trainIds, "every centroid must answer which rows produced it");
  });

  it("no holdout row seeds any centroid", () => {
    const { metadata } = loadArtifacts(GOLD_DIR);
    const bench = JSON.parse(readFileSync(BENCH, "utf8"));
    const holdout = new Set(bench.rows.filter((r) => r.split === "holdout").map((r) => r.id));
    assert.ok(holdout.size > 0);
    for (const [label, ids] of Object.entries(metadata.trainIds)) {
      for (const id of ids) assert.ok(!holdout.has(id), `${label} centroid trained on holdout row ${id}`);
    }
  });

  it("training rows are audited head labels only", () => {
    const { metadata } = loadArtifacts(GOLD_DIR);
    const bench = JSON.parse(readFileSync(BENCH, "utf8"));
    const byId = new Map(bench.rows.map((r) => [r.id, r]));
    const head = new Set(getTaxonomy().canonical.filter((c) => !["other", "unclassified", "unknown", "uncertain"].includes(c)));
    for (const [label, ids] of Object.entries(metadata.trainIds)) {
      assert.ok(head.has(label), `${label} is not a head label`);
      for (const id of ids) {
        const row = byId.get(id);
        assert.ok(row, `train row missing from benchmark: ${id}`);
        assert.equal(row.audit.status, "audited");
        assert.equal(row.audit.label, label);
      }
    }
  });
});
