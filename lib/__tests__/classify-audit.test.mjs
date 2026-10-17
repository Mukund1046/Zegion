/** Gold-audit integrity tests. Offline; validate the audited dataset-v2. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSlug, getTaxonomy } from "../classify/taxonomy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATASET = join(HERE, "..", "classify", "eval", "dataset-v2.json");
const REVIEW = join(HERE, "..", "classify", "eval", "human-review.json");

function load() {
  return JSON.parse(readFileSync(DATASET, "utf8"));
}

describe("gold audit integrity", () => {
  it("every row carries a complete audit decision", () => {
    const { rows } = load();
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.equal(r.audit.status, "audited", r.id);
      assert.equal(typeof r.audit.label, "string", r.id);
      assert.equal(typeof r.audit.note, "string", r.id);
      assert.ok(r.audit.note.length > 0, r.id);
      assert.ok(
        r.audit.silverAgreement === 1 || r.audit.silverAgreement === 0 || r.audit.silverAgreement === null,
        r.id
      );
      assert.equal(typeof r.audit.needsHumanReview, "boolean", r.id);
    }
  });

  it("every audit label validates against the taxonomy (no leaked slugs)", () => {
    const { rows } = load();
    for (const r of rows) {
      const check = validateSlug(r.audit.label);
      assert.equal(check.ok, true, `${r.id}: ${r.audit.label}`);
    }
  });

  it("four states are used distinctly and never empty", () => {
    const { rows } = load();
    const counts = { unknown: 0, other: 0, uncertain: 0 };
    for (const r of rows) {
      if (r.audit.label in counts) counts[r.audit.label] += 1;
    }
    for (const [state, n] of Object.entries(counts)) {
      assert.ok(n > 0, `${state} must be exercised by the audit`);
    }
    // Canonical labels actually used must belong to the taxonomy map
    // (labels plus the four states — validateSlug is the authority).
    const canonical = new Set([...getTaxonomy().canonical, "unclassified", "unknown", "uncertain"]);
    for (const r of rows) {
      assert.ok(canonical.has(r.audit.label), `${r.id}: ${r.audit.label}`);
    }
  });

  it("duplicate groups receive compatible decisions", () => {
    const { rows } = load();
    const groups = new Map();
    for (const r of rows) {
      if (!r.dupGroupId) continue;
      if (!groups.has(r.dupGroupId)) groups.set(r.dupGroupId, new Set());
      groups.get(r.dupGroupId).add(r.audit.label);
    }
    for (const [group, labels] of groups) {
      assert.equal(labels.size, 1, `dup group ${String(group).slice(0, 12)} diverges: ${[...labels]}`);
    }
  });

  it("temporal split is intact and holdout is untouched by training paths", () => {
    const { rows } = load();
    const dev = rows.filter((r) => r.split === "dev");
    const holdout = rows.filter((r) => r.split === "holdout");
    assert.equal(dev.length + holdout.length, rows.length);
    const devIds = new Set(dev.map((r) => r.id));
    for (const r of holdout) assert.ok(!devIds.has(r.id));
    assert.ok(holdout.length >= 60, "holdout must retain critical mass");
  });

  it("review queue exists and matches flagged rows", () => {
    assert.ok(existsSync(REVIEW), "human-review.json must exist");
    const queue = JSON.parse(readFileSync(REVIEW, "utf8"));
    const { rows } = load();
    const flagged = rows.filter((r) => r.audit.needsHumanReview);
    assert.equal(queue.count, flagged.length);
    const queuedIds = new Set(queue.queue.map((q) => q.id));
    for (const r of flagged) assert.ok(queuedIds.has(r.id), r.id);
    for (const q of queue.queue) {
      assert.ok(q.id && q.silver !== undefined && q.proposed && q.evidence && q.uncertainty);
    }
  });

  it("silver agreement is measured, not assumed", () => {
    const { rows } = load();
    const substantive = rows.filter((r) => r.audit.silverAgreement !== null);
    assert.ok(substantive.length > 100, "agreement must be measured over a real sample");
    // The audit must be allowed to disagree: a 100% agreement rate would
    // prove the auditor copied silver instead of judging fresh.
    const disagreements = substantive.filter((r) => r.audit.silverAgreement === 0);
    assert.ok(disagreements.length > 0, "zero disagreement is a red flag, not a success");
  });

  it("frozen benchmark matches the audited dataset exactly", () => {
    const frozen = JSON.parse(
      readFileSync(join(HERE, "..", "classify", "eval", "dataset-benchmark-v1.json"), "utf8")
    );
    assert.ok(frozen.benchmark?.frozenAt, "benchmark must carry frozen metadata");
    const { rows } = load();
    assert.equal(frozen.rows.length, rows.length);
    const live = new Map(rows.map((r) => [r.id, r]));
    for (const fr of frozen.rows) {
      const lr = live.get(fr.id);
      assert.ok(lr, `frozen row missing live: ${fr.id}`);
      assert.deepEqual(fr.audit, lr.audit, `audit drift on ${fr.id}`);
      assert.equal(fr.split, lr.split, `split drift on ${fr.id}`);
    }
  });
});
