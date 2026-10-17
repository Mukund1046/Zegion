/**
 * Select the Phase-7 recent-data review set from the frozen corpus.
 *
 * DEV ROWS ONLY — holdout rows are never candidates (asserted). Priority:
 *  1. newer dev rows with low local margin (bottom quartile, head-predicted)
 *  2. local-vs-Zen disagreement on dev rows
 *  3. OOD-like dev rows (high minDistance; from the OOD diagnostics dump)
 *  4. control: high-confidence recent head predictions
 * Caps keep the manual review load bounded; every selected row still
 * requires explicit human/model review with identity + timestamp before
 * it can enter any artifact.
 *
 * Usage: node lib/classify/eval/select-refresh-set.mjs
 *   [--dataset lib/classify/eval/dataset-benchmark-v1.json]
 *   [--calibration calibration-feedback-v1.json]
 *   [--local-preds preds-local.json] [--zen-preds preds-spark.json]
 *   [--difficult 30] [--control 15] [--out refresh-review-set.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");

const load = (p) => JSON.parse(readFileSync(resolve(process.cwd(), p), "utf8"));
const loadPreds = (p) => {
  const data = load(p).preds;
  return new Map(Object.entries(data[Object.keys(data)[0]]));
};

function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const dataset = load(get("--dataset", join(HERE, "dataset-benchmark-v1.json")));
  const calib = load(join(ROOT, "calibration-feedback-v1.json"));
  const localPreds = loadPreds(join(ROOT, "preds-local.json"));
  const zenPreds = loadPreds(join(ROOT, "preds-spark.json"));
  const difficultN = Number(get("--difficult", "30")) || 30;
  const controlN = Number(get("--control", "15")) || 15;
  const outPath = resolve(process.cwd(), get("--out", join(ROOT, "refresh-review-set.json")));

  const byId = new Map(dataset.rows.map((r) => [r.id, r]));
  const margins = new Map((calib.scored || []).map((s) => [s.id, s]));
  // HARD EXCLUSION: holdout rows can never be review candidates.
  const dev = dataset.rows.filter((r) => r.split !== "holdout");
  if (dev.some((r) => r.split === "holdout")) throw new Error("holdout leak in selection input");

  const withMargin = dev
    .map((r) => ({ row: r, m: margins.get(r.id) }))
    .filter((x) => x.m && typeof x.m.margin === "number");
  const sorted = [...withMargin].sort((a, b) => a.m.margin - b.m.margin);

  const picked = new Map(); // id -> reason[]
  const add = (id, reason) => {
    if (!picked.has(id)) picked.set(id, []);
    picked.get(id).push(reason);
  };

  // 1+2. Lowest-margin head-predicted rows + local/Zen disagreements (newest first).
  const byTime = [...withMargin].sort(
    (a, b) => Date.parse(b.row.postedAt || 0) - Date.parse(a.row.postedAt || 0)
  );
  // Head-predicted rows ordered by ascending margin (lowest first).
  const lowMargin = withMargin
    .filter((x) => x.m.predictedLabel && !["other", "unknown", "uncertain"].includes(x.m.predictedLabel))
    .sort((a, b) => a.m.margin - b.m.margin);
  const quota = Math.max(1, Math.floor(difficultN * 0.5));
  // Deterministic: newest low-margin head rows first.
  const lowMarginIds = new Set(lowMargin.map((x) => x.row.id));
  let added = 0;
  for (const x of byTime) {
    if (added >= quota) break;
    if (!lowMarginIds.has(x.row.id) || picked.has(x.row.id)) continue;
    // Must itself be low-margin: require membership in the bottom half.
    const rank = lowMargin.findIndex((y) => y.row.id === x.row.id);
    if (rank === -1 || rank >= Math.ceil(lowMargin.length / 2)) continue;
    add(x.row.id, "low-margin-recent");
    added += 1;
  }
  // Disagreements (newest first) fill the rest of the difficult quota.
  for (const x of byTime) {
    if ([...picked.keys()].length >= difficultN) break;
    if (picked.has(x.row.id)) continue;
    const l = localPreds.get(x.row.id);
    const z = zenPreds.get(x.row.id);
    if (l !== undefined && z !== undefined && l !== z) add(x.row.id, "local-zen-disagreement");
  }
  // OOD-like: highest minDistance among remaining dev rows.
  const ood = load(join(ROOT, "ood-diagnostics.json"));
  const distById = new Map(ood.map((d) => [d.id, d.minDistance]));
  const oodRanked = byTime.filter((x) => !picked.has(x.row.id)).sort(
    (a, b) => (distById.get(b.row.id) ?? -1) - (distById.get(a.row.id) ?? -1)
  );
  for (const x of oodRanked) {
    if ([...picked.keys()].length >= difficultN) break;
    add(x.row.id, "ood-like");
  }

  // 3. Control: highest-margin recent head predictions.
  const highFirst = [...withMargin]
    .filter((x) => !picked.has(x.row.id))
    .sort((a, b) => b.m.margin - a.m.margin);
  const recentHigh = highFirst
    .sort((a, b) => Date.parse(b.row.postedAt || 0) - Date.parse(a.row.postedAt || 0))
    .slice(0, controlN * 3)
    .sort((a, b) => b.m.margin - a.m.margin)
    .slice(0, controlN);
  for (const x of recentHigh) add(x.row.id, "control-high-confidence");

  const set = [...picked.entries()].map(([id, reasons]) => {
    const row = byId.get(id);
    const m = margins.get(id);
    return {
      id,
      split: row.split,
      postedAt: row.postedAt,
      authorHandle: row.authorHandle,
      text: row.text,
      links: row.links,
      silverCategory: row.silverCategory,
      auditLabel: row.audit?.label ?? null,
      localMargin: m?.margin ?? null,
      localPred: localPreds.get(id) ?? null,
      zenPred: zenPreds.get(id) ?? null,
      reasons,
      review: { status: "pending", label: null, reviewer: null, reviewedAt: null, note: "" },
    };
  });
  // Safety: assert no holdout row selected.
  if (set.some((r) => r.split === "holdout")) throw new Error("holdout row selected for review");
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), count: set.length, rows: set }, null, 2) + "\n");
  const reasonCounts = {};
  for (const r of set) for (const reason of r.reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  console.log(`wrote ${set.length} review candidates -> ${outPath}`);
  console.log(JSON.stringify(reasonCounts));
}

main();
