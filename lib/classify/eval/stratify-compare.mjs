/**
 * Stratified provider comparison (read-only analysis, no model calls).
 *
 * Splits: A (all) / B (coverable head refs) / C (other-unknown-uncertain
 * refs) / D (per canonical class), each overall + dev + holdout.
 * Also emits the disagreement cells (local-correct/Zen-wrong and reverse,
 * both-wrong, both-abstain) and local margin distributions by correctness.
 *
 * Inputs: frozen benchmark + harness report JSONs + calibration per-row
 * dump + saved prediction maps. Writes a gitignored JSON report.
 *
 * Usage: node lib/classify/eval/stratify-compare.mjs [--out stratify-report.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { partition, referenceOf } from "./strata.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");

const load = (p) => JSON.parse(readFileSync(resolve(process.cwd(), p), "utf8"));
const loadPreds = (p) => {
  const data = load(p).preds;
  return new Map(Object.entries(data[Object.keys(data)[0]]));
};

function summarize(ids, predOf, refOf) {
  let correct = 0;
  let scored = 0;
  const perClass = new Map();
  for (const id of ids) {
    const ref = refOf.get(id);
    const pred = predOf.get(id);
    if (!perClass.has(ref)) perClass.set(ref, { tp: 0, total: 0 });
    perClass.get(ref).total += 1;
    if (pred === undefined) continue;
    scored += 1;
    if (pred === ref) {
      correct += 1;
      perClass.get(ref).tp += 1;
    }
  }
  const classes = [...perClass.entries()].map(([label, s]) => ({
    label,
    recall: s.total > 0 ? s.tp / s.total : null,
    support: s.total,
  }));
  return {
    n: ids.length,
    scored,
    accuracy: scored > 0 ? correct / scored : null,
    perClass: classes.sort((a, b) => b.support - a.support),
  };
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const outPath = resolve(process.cwd(), get("--out", join(ROOT, "stratify-report.json")));
  const dataset = load(join(HERE, "dataset-benchmark-v1.json"));
  const rows = dataset.rows;
  const refOf = new Map(rows.map((r) => [r.id, referenceOf(r)]));
  const parts = partition(rows);
  const ids = (list) => list.map((r) => r.id);
  const devIds = new Set(parts.dev.map((r) => r.id));

  const providers = {
    regex: loadPreds(join(ROOT, "preds-regex.json")),
    local: loadPreds(join(ROOT, "preds-local.json")),
    spark: loadPreds(join(ROOT, "preds-spark.json")),
  };

  const table = {};
  for (const [name, preds] of Object.entries(providers)) {
    const subsets = {
      A: rows,
      B: parts.B,
      C: parts.C,
      dev: parts.dev,
      holdout: parts.holdout,
    };
    table[name] = {};
    for (const [subset, list] of Object.entries(subsets)) {
      const s = summarize(ids(list), preds, refOf);
      table[name][subset] = { n: s.n, scored: s.scored, accuracy: s.accuracy, perClass: s.perClass };
    }
  }

  // Disagreement cells (local vs spark) + abstention accounting.
  const local = providers.local;
  const spark = providers.spark;
  const cells = { localCorrectZenWrong: 0, zenCorrectLocalWrong: 0, bothWrong: 0, bothAbstain: 0, agree: 0 };
  const cellsHoldout = { localCorrectZenWrong: 0, zenCorrectLocalWrong: 0, bothWrong: 0, bothAbstain: 0, agree: 0 };
  for (const row of rows) {
    const ref = refOf.get(row.id);
    const l = local.get(row.id);
    const z = spark.get(row.id);
    const lc = l === ref;
    const zc = z === ref;
    const target = row.split === "holdout" ? cellsHoldout : cells;
    if (l === undefined && z === undefined) target.bothAbstain += 1;
    else if (lc && zc) target.agree += 1;
    else if (lc) target.localCorrectZenWrong += 1;
    else if (zc) target.zenCorrectLocalWrong += 1;
    else target.bothWrong += 1;
  }

  // Local margin distributions by correctness (from calibration per-row dump).
  const calib = load(join(ROOT, "calibration-feedback-v1.json"));
  const margins = { correct: [], incorrect: [] };
  const marginsHoldout = { correct: [], incorrect: [] };
  for (const s of calib.scored || []) {
    if (typeof s.margin !== "number") continue;
    (s.correct ? margins.correct : margins.incorrect).push(s.margin);
    if (s.split === "holdout") (s.correct ? marginsHoldout.correct : marginsHoldout.incorrect).push(s.margin);
  }
  const describe = (xs) => {
    if (xs.length === 0) return { n: 0 };
    const sorted = [...xs].sort((a, b) => a - b);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    return { n: xs.length, mean, p10: sorted[Math.floor(sorted.length * 0.1)], p50: sorted[Math.floor(sorted.length * 0.5)], p90: sorted[Math.floor(sorted.length * 0.9)] };
  };

  const report = {
    generatedAt: new Date().toISOString(),
    dataset: dataset.version,
    strata: table,
    disagreement: cells,
    disagreementHoldout: cellsHoldout,
    margins: {
      correct: describe(margins.correct),
      incorrect: describe(margins.incorrect),
      holdoutCorrect: describe(marginsHoldout.correct),
      holdoutIncorrect: describe(marginsHoldout.incorrect),
    },
  };
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`wrote ${outPath}`);

  const pct = (v) => (v === null ? "n/a" : (100 * v).toFixed(1) + "%");
  for (const [name, t] of Object.entries(table)) {
    console.log(`${name}: A=${pct(t.A.accuracy)} B=${pct(t.B.accuracy)} C=${pct(t.C.accuracy)} dev=${pct(t.dev.accuracy)} holdout=${pct(t.holdout.accuracy)}`);
  }
  console.log("disagreement(all): " + JSON.stringify(cells));
  console.log("disagreement(holdout): " + JSON.stringify(cellsHoldout));
}

main();
