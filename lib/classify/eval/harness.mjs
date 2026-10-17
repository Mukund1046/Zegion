/**
 * Evaluation harness: runs providers over the stratified dataset and records
 * comparable metrics. Reference labels are audit.label when audited,
 * otherwise the canonicalized silver category (silver = bootstrapping,
 * never ground truth — see dataset audit discipline).
 *
 * Metrics per provider: accuracy, per-class precision/recall/F1, confusion
 * pairs, calibration bins (only meaningful for non-null confidence),
 * p50/p95 per-item latency, first-result latency, batch throughput, failure
 * and timeout rates, pairwise agreement rate.
 *
 * Usage:
 *   node lib/classify/eval/harness.mjs --provider regex [--max-items 50] [--out out.json]
 *   node lib/classify/eval/harness.mjs --provider opencode --max-items 40
 *   node lib/classify/eval/harness.mjs --provider both --max-items 40
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { classifyBookmark } from "../../../node_modules/fieldtheory/dist/bookmark-classify.js";
import { canonicalize } from "../taxonomy.mjs";
import { score, percentile } from "./score.mjs";
import { createOpenCodeProvider } from "../opencode/provider.mjs";
import { createLocalMLProvider } from "../local/provider.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadDataset(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Regex provider adapter: contract-shaped, uncalibrated, no-match → omitted. */
function regexClassifyBatch(items) {
  const started = Date.now();
  const results = [];
  for (const item of items) {
    const predicted = classifyBookmark({ text: item.text || "", links: item.links || [] });
    if (predicted.categories.length === 0) continue; // caller maps gaps to `unknown`
    const primary = canonicalize(predicted.primary);
    results.push({
      id: item.id,
      label: primary,
      confidence: null,
      candidates: [...new Set([primary, ...predicted.categories.map(canonicalize)])],
      provider: "regex",
      model: "fieldtheory-rules",
      latencyMs: 0,
      version: "ft-rules",
      fallbackUsed: false,
    });
  }
  return { results, latencyMs: Date.now() - started };
}

async function runProvider(name, rows, { batchSize, maxItems, onlyModel, artifactDir, onFirstResult }) {
  const limited = rows.slice(0, maxItems);
  const perItemLatency = [];
  const predictions = new Map(); // id -> result
  let failures = 0;
  let timeouts = 0;
  let firstResultMs = null;
  const startedAll = Date.now();
  let done = 0;

  const recordBatch = (results, batchLatencyMs) => {
    if (firstResultMs === null && results.length > 0) {
      firstResultMs = Date.now() - startedAll;
      onFirstResult?.(name, firstResultMs);
    }
    const each = results.length > 0 ? batchLatencyMs / results.length : 0;
    for (const r of results) {
      predictions.set(r.id, r);
      perItemLatency.push(r.latencyMs > 0 ? r.latencyMs : each);
    }
    done += results.length;
  };

  // tqdm-style progress line after every batch (stderr-safe single lines).
  const reportProgress = (note = "") => {
    const elapsedS = (Date.now() - startedAll) / 1000;
    const pct = limited.length > 0 ? Math.round((100 * done) / limited.length) : 100;
    const rate = elapsedS > 0 ? done / elapsedS : 0;
    const eta = rate > 0 ? `${Math.round((limited.length - done) / rate)}s` : "?";
    console.log(`[${name}] ${done}/${limited.length} (${pct}%) elapsed=${elapsedS.toFixed(0)}s eta=${eta} failures=${failures}${note}`);
  };

  if (name === "regex") {
    for (let i = 0; i < limited.length; i += batchSize) {
      const batch = limited.slice(i, i + batchSize);
      try {
        const { results, latencyMs } = regexClassifyBatch(batch);
        recordBatch(results, latencyMs);
      } catch {
        failures += batch.length;
      }
      reportProgress();
    }
  } else if (name === "opencode") {
    // --model pins a single model for independent per-model measurement
    // (the default chain would conflate models via failover).
    const provider = createOpenCodeProvider(onlyModel ? { freeModels: [onlyModel] } : {});
    const size = provider.config.batchSize;
    for (let i = 0; i < limited.length; i += size) {
      const batch = limited.slice(i, i + size);
      const batchStart = Date.now();
      try {
        const results = await provider.classifyBatch(batch);
        recordBatch(results, Date.now() - batchStart);
      } catch (err) {
        failures += batch.length;
        if (/timed out|timeout/i.test(err.message)) timeouts += batch.length;
      }
      reportProgress();
    }
  } else if (name === "local") {
    // --artifact selects the centroid artifact dir (default: silver v1).
    const provider = createLocalMLProvider(artifactDir ? { artifactDir: resolve(process.cwd(), artifactDir) } : {});
    const size = 32;
    for (let i = 0; i < limited.length; i += size) {
      const batch = limited.slice(i, i + size);
      const batchStart = Date.now();
      try {
        const results = await provider.classifyBatch(batch);
        recordBatch(results, Date.now() - batchStart);
      } catch (err) {
        failures += batch.length;
        if (/timed out|timeout/i.test(err.message)) timeouts += batch.length;
      }
      reportProgress();
    }
  } else {
    throw new Error(`Unknown provider: ${name}`);
  }

  void done;
  const totalMs = Date.now() - startedAll;
  perItemLatency.sort((a, b) => a - b);
  return {
    predictions,
    stats: {
      items: limited.length,
      predicted: predictions.size,
      failures,
      timeouts,
      totalMs,
      firstResultMs,
      throughputPerSec: totalMs > 0 ? (predictions.size / totalMs) * 1000 : 0,
      p50Ms: percentile(perItemLatency, 50),
      p95Ms: percentile(perItemLatency, 95),
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const providerArg = get("--provider", "regex");
  const maxItems = Number(get("--max-items", "200")) || 200;
  const batchSize = Number(get("--batch-size", "50")) || 50;
  const outPath = get("--out", null);
  // Frozen gold benchmark by default; override only for explicitly
  // non-benchmark experiments (never for reported numbers).
  const datasetPath = resolve(process.cwd(), get("--dataset", join(HERE, "dataset-benchmark-v1.json")));

  const dataset = loadDataset(datasetPath);
  const names = providerArg === "both"
    ? ["regex", "opencode"]
    : providerArg === "all"
      ? ["regex", "opencode", "local"]
      : [providerArg];
  const report = { dataset: dataset.version, rows: dataset.rows.length, ran: 0, holdoutRan: 0, providers: {} };
  const allPreds = {};
  const onlyModel = get("--model", null);
  const artifactDir = get("--artifact", null);
  for (const name of names) {
    const { predictions, stats } = await runProvider(name, dataset.rows, { batchSize, maxItems, onlyModel, artifactDir });
    allPreds[name] = predictions;
    const ranRows = dataset.rows.slice(0, maxItems);
    const holdoutRows = ranRows.filter((r) => r.split === "holdout");
    report.ran = ranRows.length;
    report.holdoutRan = holdoutRows.length;
    const full = score(predictions, ranRows);
    // Holdout slice scored separately for isolated reporting. The holdout
    // is read-only reference: nothing here trains, tunes, or thresholds.
    // Non-emittable rows (reference outside the predictor's emitted label
    // set) are counted explicitly so a head-only ceiling is never mistaken
    // for model failure.
    const holdout = score(predictions, holdoutRows);
    const emitted = new Set([...predictions.values()].map((p) => p.label));
    const nonEmittableHoldout = holdoutRows.filter((r) => {
      const ref = r.audit?.status === "audited" && r.audit.label ? r.audit.label : canonicalize(r.silverCategory);
      return !emitted.has(ref);
    }).length;
    report.providers[name] = {
      ...stats,
      ...full,
      holdout: { ...holdout, items: holdoutRows.length, nonEmittable: nonEmittableHoldout },
    };
  }
  if (names.length > 1) {
    const [a, b] = names;
    let agree = 0;
    let both = 0;
    for (const row of dataset.rows.slice(0, maxItems)) {
      const pa = allPreds[a].get(row.id);
      const pb = allPreds[b].get(row.id);
      if (pa && pb) {
        both += 1;
        if (pa.label === pb.label) agree += 1;
      }
    }
    report.agreement = { pair: `${a}-vs-${b}`, both, agree, rate: both > 0 ? agree / both : null };
  }
  const text = JSON.stringify(report, null, 2);
  if (outPath) {
    writeFileSync(resolve(process.cwd(), outPath), text + "\n");
    console.log(`wrote ${outPath}`);
  }
  // --save-preds writes a compact id→label map for disagreement analysis.
  const savePreds = get("--save-preds", null);
  if (savePreds) {
    const maps = {};
    for (const [name, preds] of Object.entries(allPreds)) {
      maps[name] = Object.fromEntries([...preds.entries()].map(([id, r]) => [id, r.label]));
    }
    writeFileSync(resolve(process.cwd(), savePreds), JSON.stringify({ dataset: dataset.version, preds: maps }, null, 2) + "\n");
    console.log(`wrote ${savePreds}`);
  }
  // Compact console summary (full detail in JSON).
  for (const [name, p] of Object.entries(report.providers)) {
    const acc = p.accuracy === null ? "n/a" : (100 * p.accuracy).toFixed(1) + "%";
    const cov = p.coverableAccuracy === null ? "n/a" : (100 * p.coverableAccuracy).toFixed(1) + `%/${p.coverableRows}`;
    const mic = p.micro?.f1 === null || p.micro?.f1 === undefined ? "n/a" : (100 * p.micro.f1).toFixed(1) + "%";
    const mac = p.macro?.f1 === null || p.macro?.f1 === undefined ? "n/a" : (100 * p.macro.f1).toFixed(1) + "%";
    console.log(`${name}: acc=${acc} microF1=${mic} macroF1=${mac} coverable=${cov} scored=${p.scored}/${p.items} invalid=${p.invalid} abstained=${p.abstained} failures=${p.failures} timeouts=${p.timeouts} p50=${p.p50Ms}ms p95=${p.p95Ms}ms first=${p.firstResultMs}ms thr=${p.throughputPerSec.toFixed(1)}/s holdoutAcc=${p.holdout.accuracy === null ? "n/a" : (100 * p.holdout.accuracy).toFixed(1) + `%/${p.holdout.scored}/${p.holdout.items}`}`);
  }
  if (report.agreement) console.log(`agreement ${report.agreement.pair}: ${report.agreement.rate === null ? "n/a" : (100 * report.agreement.rate).toFixed(1) + "%"} (${report.agreement.agree}/${report.agreement.both})`);
}

main().catch((err) => {
  console.error(`harness failed: ${err.message}`);
  process.exitCode = 1;
});
