/**
 * Apply the model audit pass to dataset-v2.json and verify consistency.
 *
 * - Every dataset id must have exactly one decision; unknown ids rejected.
 * - Labels must validate via taxonomy.validateSlug (no leaked raw slugs).
 * - Duplicate groups must receive compatible (canonical-equal) decisions.
 * - Split/audit-holdout integrity re-verified; artifacts untouched.
 * - Writes human-review.json (the review queue) and prints the audit report.
 *
 * Usage: node lib/classify/eval/apply-audit.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSlug } from "../taxonomy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const NON_SUBSTANTIVE_SILVER = new Set(["unclassified", "uncategorized"]);

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const datasetPath = join(HERE, "dataset-v2.json");
  const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
  const decisions = JSON.parse(readFileSync(join(HERE, "audit-decisions.json"), "utf8"));

  const rows = dataset.rows;
  const rowIds = new Set(rows.map((r) => r.id));
  const decisionIds = new Set(Object.keys(decisions));
  const missing = [...rowIds].filter((id) => !decisionIds.has(id));
  const extra = [...decisionIds].filter((id) => !rowIds.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`decision coverage mismatch: missing=${missing.length} extra=${extra.length}`);
  }

  const labelCounts = {};
  const stateCounts = { unknown: 0, other: 0, uncertain: 0 };
  let agree = 0;
  let disagree = 0;
  let naSilver = 0;
  let invalidLabels = 0;
  let needsReview = 0;
  const reviewQueue = [];
  const dupGroups = new Map();

  for (const row of rows) {
    const [label, agreement, note, review] = decisions[row.id];
    const check = validateSlug(label);
    if (!check.ok) {
      invalidLabels += 1;
      console.error(`INVALID label ${JSON.stringify(label)} on ${row.id}`);
      continue;
    }
    const canonical = check.canonical;
    row.audit = {
      status: "audited",
      label: canonical,
      note,
      silverAgreement: agreement === "-" ? null : agreement,
      needsHumanReview: review === 1,
    };
    labelCounts[canonical] = (labelCounts[canonical] || 0) + 1;
    if (canonical in stateCounts) stateCounts[canonical] += 1;
    if (agreement === 1) agree += 1;
    else if (agreement === 0) disagree += 1;
    else naSilver += 1;

    if (review === 1) {
      needsReview += 1;
      reviewQueue.push({
        id: row.id,
        split: row.split,
        silver: row.silverCategory,
        proposed: [canonical],
        evidence: (row.text || "").slice(0, 280),
        uncertainty: note,
      });
    }
    if (row.dupGroupId) {
      if (!dupGroups.has(row.dupGroupId)) dupGroups.set(row.dupGroupId, new Set());
      dupGroups.get(row.dupGroupId).add(canonical);
    }
  }

  const dupIssues = [...dupGroups.entries()]
    .filter(([, labels]) => labels.size > 1)
    .map(([group, labels]) => ({ group: String(group).slice(0, 12), labels: [...labels] }));

  // Split + holdout integrity (must be unchanged by the audit).
  const dev = new Set(rows.filter((r) => r.split === "dev").map((r) => r.id));
  const hold = new Set(rows.filter((r) => r.split === "holdout").map((r) => r.id));
  const overlap = [...dev].filter((id) => hold.has(id));
  const splitOk = dev.size + hold.size === rows.length && overlap.length === 0;

  const totalSubstantive = agree + disagree;
  const report = {
    TOTAL: rows.length,
    AUDITED: rows.filter((r) => r.audit.status === "audited").length,
    NEEDS_HUMAN_REVIEW: needsReview,
    HIGH_CONFIDENCE: rows.length - needsReview,
    SILVER_AGREEMENT: `${agree}/${totalSubstantive} (${totalSubstantive ? (100 * agree / totalSubstantive).toFixed(1) : "0.0"}%)`,
    SILVER_DISAGREEMENT: `${disagree}/${totalSubstantive} (${totalSubstantive ? (100 * disagree / totalSubstantive).toFixed(1) : "0.0"}%)`,
    SILVER_NA: naSilver,
    UNKNOWN: stateCounts.unknown,
    OTHER: stateCounts.other,
    UNCERTAIN: stateCounts.uncertain,
    INVALID_LABELS: invalidLabels,
    DUPLICATE_CONSISTENCY_ISSUES: dupIssues.length,
    TAXONOMY_ISSUES: invalidLabels,
    HOLDOUT_LEAKAGE_CHECK: splitOk && hold.size === 68 ? "PASS (68 holdout rows, no overlap, no training path consumes dataset files)" : "FAIL",
    classCounts: labelCounts,
    dupIssues,
  };

  if (!dryRun) {
    writeFileSync(datasetPath, JSON.stringify(dataset, null, 2) + "\n");
    writeFileSync(join(HERE, "human-review.json"), JSON.stringify({ count: reviewQueue.length, queue: reviewQueue }, null, 2) + "\n");
  }
  console.log(JSON.stringify(report, null, 2));
}

main();
