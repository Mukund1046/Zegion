/**
 * OOD shadow experiment: can centroid-distance signals identify the
 * structurally un-emittable rows (other/unknown/uncertain refs) while
 * preserving head-class coverage?
 *
 * Read-only analysis: loads the frozen benchmark, runs the local
 * provider for full score vectors, fits candidate operating points on
 * DEV ONLY, evaluates them UNCHANGED on holdout. Writes a gitignored
 * report + per-row diagnostics. No production changes.
 *
 * Usage: node lib/classify/eval/ood-analyze.mjs [--artifact <dir>]
 *   [--out ood-report.json] [--diag ood-diagnostics.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalMLProvider } from "../local/provider.mjs";
import { scoreSignals, fitThreshold, evaluateThreshold, evaluateAnd } from "./ood.mjs";
import { referenceOf } from "./strata.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const OOD_REFS = new Set(["other", "unknown", "uncertain"]);

function loadPreds(path) {
  const data = JSON.parse(readFileSync(path, "utf8")).preds;
  return new Map(Object.entries(data[Object.keys(data)[0]]));
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const artifactDir = get("--artifact", join(HERE, "..", "local", "artifacts", "feedback-v1"));
  const outPath = resolve(process.cwd(), get("--out", join(ROOT, "ood-report.json")));
  const diagPath = resolve(process.cwd(), get("--diag", join(ROOT, "ood-diagnostics.json")));

  const dataset = JSON.parse(readFileSync(join(HERE, "dataset-benchmark-v1.json"), "utf8"));
  const rows = dataset.rows;
  const regexPreds = loadPreds(join(ROOT, "preds-regex.json"));

  const provider = createLocalMLProvider({ artifactDir: resolve(process.cwd(), artifactDir) });
  const items = [];
  for (let i = 0; i < rows.length; i += 32) {
    const batch = rows.slice(i, i + 32);
    const results = await provider.classifyBatch(batch);
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const row of batch) {
      const r = byId.get(row.id);
      if (!r) continue;
      const ref = referenceOf(row);
      items.push({
        id: row.id,
        split: row.split,
        ref,
        isOod: OOD_REFS.has(ref),
        regexFired: regexPreds.has(row.id),
        signals: scoreSignals(r.scores || {}),
      });
    }
    console.log(`ood-analyze: ${Math.min(i + 32, rows.length)}/${rows.length}`);
  }

  const dev = items.filter((r) => r.split !== "holdout");
  const holdout = items.filter((r) => r.split === "holdout");
  const devOod = dev.filter((r) => r.isOod).length;
  const holdOod = holdout.filter((r) => r.isOod).length;
  console.log(`dev=${dev.length} (ood=${devOod}) holdout=${holdout.length} (ood=${holdOod})`);

  // Candidate operating points, fit on DEV ONLY.
  const signals = [
    { key: "minDistance", higherIsOod: true },
    { key: "margin", higherIsOod: false },
    { key: "msp", higherIsOod: false },
    { key: "energy", higherIsOod: true },
    { key: "top1Score", higherIsOod: false },
  ];
  const fitted = {};
  for (const s of signals) {
    fitted[s.key] = { ...s, fit: fitThreshold(dev, s.key, s.higherIsOod) };
  }
  const report = { generatedAt: new Date().toISOString(), dataset: dataset.version, devN: dev.length, holdoutN: holdout.length, signals: {}, combos: {} };

  for (const [key, f] of Object.entries(fitted)) {
    if (!f.fit) {
      report.signals[key] = { fit: null };
      continue;
    }
    report.signals[key] = {
      threshold: f.fit.threshold,
      dev: { ...evaluateThreshold(dev, key, f.fit.threshold, f.higherIsOod), fitF1: f.fit.f1 },
      holdout: evaluateThreshold(holdout, key, f.fit.threshold, f.higherIsOod),
    };
  }

  // distance+regex: OOD iff distance fires AND regex did NOT fire
  // (regex hits are head-evidence; their absence supports OOD).
  const evalDistRegex = (list, t) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let headTotal = 0;
    let headKept = 0;
    for (const r of list) {
      const predicted = r.signals.minDistance >= t && !r.regexFired;
      if (predicted && r.isOod) tp += 1;
      else if (predicted) fp += 1;
      else if (r.isOod) fn += 1;
      if (!r.isOod) {
        headTotal += 1;
        if (!predicted) headKept += 1;
      }
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : null;
    const recall = tp + fn > 0 ? tp / (tp + fn) : null;
    return { predicted: tp + fp, actual: tp + fn, precision, recall, falseOod: fp, headRetained: headTotal > 0 ? headKept / headTotal : null };
  };
  const evalTriple = (list, tDist, tMargin) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let headTotal = 0;
    let headKept = 0;
    for (const r of list) {
      const predicted = r.signals.minDistance >= tDist && r.signals.margin <= tMargin && !r.regexFired;
      if (predicted && r.isOod) tp += 1;
      else if (predicted) fp += 1;
      else if (r.isOod) fn += 1;
      if (!r.isOod) {
        headTotal += 1;
        if (!predicted) headKept += 1;
      }
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : null;
    const recall = tp + fn > 0 ? tp / (tp + fn) : null;
    return { predicted: tp + fp, actual: tp + fn, precision, recall, falseOod: fp, headRetained: headTotal > 0 ? headKept / headTotal : null };
  };

  const tDist = fitted.minDistance.fit?.threshold ?? null;
  const tMargin = fitted.margin.fit?.threshold ?? null;
  report.combos["distance+margin"] = tDist !== null && tMargin !== null
    ? { dev: evaluateAnd(dev, { key: "minDistance", higherIsOod: true, threshold: tDist }, { key: "margin", higherIsOod: false, threshold: tMargin }), holdout: evaluateAnd(holdout, { key: "minDistance", higherIsOod: true, threshold: tDist }, { key: "margin", higherIsOod: false, threshold: tMargin }) }
    : null;
  report.combos["distance+regex"] = tDist !== null
    ? { dev: evalDistRegex(dev, tDist), holdout: evalDistRegex(holdout, tDist) }
    : null;
  report.combos["distance+margin+regex"] = tDist !== null && tMargin !== null
    ? { dev: evalTriple(dev, tDist, tMargin), holdout: evalTriple(holdout, tDist, tMargin) }
    : null;

  // Per-row diagnostics for inspection.
  const diagnostics = items.map((r) => {
    const ranked = r.signals;
    return {
      id: r.id,
      split: r.split,
      goldLabel: dataset.rows.find((x) => x.id === r.id)?.audit?.label ?? null,
      top1: ranked.top1,
      top1Score: ranked.top1Score,
      top2: ranked.top2,
      top2Score: ranked.top2Score,
      margin: ranked.margin,
      minDistance: ranked.minDistance,
      msp: ranked.msp,
      energy: ranked.energy,
      regexEvidence: r.regexFired,
      proposedOOD: tDist !== null ? ranked.minDistance >= tDist : null,
    };
  });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(diagPath, JSON.stringify(diagnostics, null, 2) + "\n");
  console.log(`wrote ${outPath} + ${diagPath}`);

  const pct = (v) => (v === null ? "n/a" : (100 * v).toFixed(1) + "%");
  for (const [key, s] of Object.entries(report.signals)) {
    if (!s.threshold && s.threshold !== 0) {
      console.log(`${key}: no fit`);
      continue;
    }
    console.log(`${key} t=${s.threshold.toFixed(4)} dev P=${pct(s.dev.precision)} R=${pct(s.dev.recall)} headRet=${pct(s.dev.headRetained)} | holdout P=${pct(s.holdout.precision)} R=${pct(s.holdout.recall)} headRet=${pct(s.holdout.headRetained)}`);
  }
  for (const [name, c] of Object.entries(report.combos)) {
    if (!c) continue;
    console.log(`${name}: dev P=${pct(c.dev.precision)} R=${pct(c.dev.recall)} headRet=${pct(c.dev.headRetained)} | holdout P=${pct(c.holdout.precision)} R=${pct(c.holdout.recall)} headRet=${pct(c.holdout.headRetained)}`);
  }
}

main().catch((err) => {
  console.error(`ood-analyze failed: ${err.message}`);
  process.exitCode = 1;
});
