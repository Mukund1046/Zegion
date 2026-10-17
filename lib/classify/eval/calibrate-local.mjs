/**
 * Local-v2 calibration analysis: score/margin distributions vs correctness.
 *
 * Read-only with respect to production: loads the frozen benchmark and the
 * gold artifacts, runs inference, writes a gitignored report. It fits
 * NOTHING into production and changes no thresholds.
 *
 * Usage: node lib/classify/eval/calibrate-local.mjs [--max-items 226]
 *   [--out calibration-local-v2.json]
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalMLProvider } from "../local/provider.mjs";
import {
  reliabilityBins,
  checkMonotonic,
  selectiveCurve,
  fitPlatt,
  applyPlatt,
  brierNaive,
} from "./calibration.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function referenceLabel(row) {
  return row.audit?.status === "audited" && row.audit.label ? row.audit.label : row.silverCategory;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const maxItems = Number(get("--max-items", "226")) || 226;
  const outPath = resolve(process.cwd(), get("--out", join(HERE, "..", "..", "calibration-local-v2.json")));
  const artifactDir = get("--artifact", null);

  const dataset = JSON.parse(
    (await import("node:fs")).readFileSync(join(HERE, "dataset-benchmark-v1.json"), "utf8")
  );
  const rows = dataset.rows.slice(0, maxItems);
  const provider = createLocalMLProvider(artifactDir ? { artifactDir: resolve(process.cwd(), artifactDir) } : {});
  const scored = [];
  for (let i = 0; i < rows.length; i += 32) {
    const batch = rows.slice(i, i + 32);
    const results = await provider.classifyBatch(batch);
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const row of batch) {
      const r = byId.get(row.id);
      if (!r) continue;
      const ranked = Object.entries(r.scores || {}).sort((a, b) => b[1] - a[1]);
      const topScore = ranked.length > 0 ? ranked[0][1] : null;
      const secondScore = ranked.length > 1 ? ranked[1][1] : null;
      scored.push({
        id: row.id,
        split: row.split,
        trueLabel: referenceLabel(row),
        predictedLabel: r.label,
        topScore,
        secondScore,
        margin: topScore !== null && secondScore !== null ? topScore - secondScore : null,
        correct: r.label === referenceLabel(row),
      });
    }
    console.log(`calibrate-local: ${Math.min(i + 32, rows.length)}/${rows.length}`);
  }

  const dev = scored.filter((s) => s.split !== "holdout");
  const holdout = scored.filter((s) => s.split === "holdout");
  const analyze = (items, name) => {
    const withScores = items.filter((s) => typeof s.topScore === "number");
    const correct = withScores.filter((s) => s.correct);
    const incorrect = withScores.filter((s) => !s.correct);
    const mean = (xs) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return {
      name,
      n: items.length,
      accuracy: withScores.length > 0 ? correct.length / withScores.length : null,
      topScoreMeanCorrect: mean(correct.map((s) => s.topScore)),
      topScoreMeanIncorrect: mean(incorrect.map((s) => s.topScore)),
      marginMeanCorrect: mean(correct.map((s) => s.margin).filter((v) => v !== null)),
      marginMeanIncorrect: mean(incorrect.map((s) => s.margin).filter((v) => v !== null)),
      scoreBins: reliabilityBins(items, "topScore", 10),
      scoreMonotonic: checkMonotonic(reliabilityBins(items, "topScore", 10)),
      marginBins: reliabilityBins(items, "margin", 10),
      marginMonotonic: checkMonotonic(reliabilityBins(items, "margin", 10)),
      selectiveByMargin: selectiveCurve(items, "margin"),
      selectiveByScore: selectiveCurve(items, "topScore"),
      brierNaive: brierNaive(items),
    };
  };

  const platt = fitPlatt(dev);
  let plattHoldoutBrier = null;
  if (platt.fitted) {
    let sum = 0;
    let n = 0;
    for (const s of holdout) {
      if (typeof s.topScore !== "number") continue;
      sum += (applyPlatt(s.topScore, platt) - (s.correct ? 1 : 0)) ** 2;
      n += 1;
    }
    plattHoldoutBrier = n > 0 ? sum / n : null;
  }

  // Per-class behavior on dev (never fit per-class thresholds here).
  const perClass = new Map();
  for (const s of dev) {
    if (!perClass.has(s.trueLabel)) perClass.set(s.trueLabel, { support: 0, correct: 0, margins: [], scores: [] });
    const c = perClass.get(s.trueLabel);
    c.support += 1;
    if (s.correct) c.correct += 1;
    if (typeof s.margin === "number") c.margins.push(s.margin);
    if (typeof s.topScore === "number") c.scores.push(s.topScore);
  }
  const perClassReport = [...perClass.entries()].map(([label, c]) => {
    const sorted = [...c.margins].sort((a, b) => a - b);
    return {
      label,
      support: c.support,
      recall: c.support > 0 ? c.correct / c.support : null,
      marginP50: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null,
      marginMin: sorted.length > 0 ? sorted[0] : null,
    };
  }).sort((a, b) => b.support - a.support);

  const report = {
    generatedAt: new Date().toISOString(),
    dataset: "dataset-benchmark-v1.json",
    rows: scored.length,
    // Per-row margins (ids + scores only, no text): feeds stratified and
    // disagreement analysis without re-running inference.
    scored: scored.map((s) => ({
      id: s.id,
      split: s.split,
      trueLabel: s.trueLabel,
      predictedLabel: s.predictedLabel,
      topScore: s.topScore,
      margin: s.margin,
      correct: s.correct,
    })),
    dev: analyze(dev, "dev"),
    holdout: analyze(holdout, "holdout"),
    plattGlobal: platt,
    plattHoldoutBrier,
    perClassDev: perClassReport,
  };
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`wrote ${outPath}`);

  // Console: the two verdicts that matter most.
  for (const section of [report.dev, report.holdout]) {
    console.log(`--- ${section.name} n=${section.n} acc=${section.accuracy === null ? "n/a" : (100 * section.accuracy).toFixed(1) + "%"}`);
    console.log(`topScore mean correct=${fmt(section.topScoreMeanCorrect)} incorrect=${fmt(section.topScoreMeanIncorrect)} monotonic=${section.scoreMonotonic.monotonic} (violations=${section.scoreMonotonic.violations})`);
    console.log(`margin mean correct=${fmt(section.marginMeanCorrect)} incorrect=${fmt(section.marginMeanIncorrect)} monotonic=${section.marginMonotonic.monotonic} (violations=${section.marginMonotonic.violations})`);
    console.log("selective-by-margin (fraction/coverage/precision): " + section.selectiveByMargin.map((p) => `${p.fraction.toFixed(1)}/${(100 * p.coverage).toFixed(0)}%/${p.precision === null ? "n/a" : (100 * p.precision).toFixed(0) + "%"}`).join(" "));
  }
  console.log(`platt fitted=${platt.fitted}${platt.fitted ? ` brierInSample=${platt.brierInSample.toFixed(4)} holdoutBrier=${plattHoldoutBrier === null ? "n/a" : plattHoldoutBrier.toFixed(4)} naiveHoldoutBrier=${report.holdout.brierNaive === null ? "n/a" : report.holdout.brierNaive.toFixed(4)}` : ` reason=${platt.reason}`}`);

  function fmt(v) {
    return v === null ? "n/a" : v.toFixed(4);
  }
}

main().catch((err) => {
  console.error(`calibrate-local failed: ${err.message}`);
  process.exitCode = 1;
});
