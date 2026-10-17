/**
 * Promotion gate: candidate artifact vs production artifact on the frozen
 * benchmark. No-regression rule (documented, not tuned):
 *
 *   PROMOTE iff candidate.macroF1 >= baseline.macroF1
 *           AND candidate.accuracy  >= baseline.accuracy
 *           AND candidate.holdoutAccuracy >= baseline.holdoutAccuracy
 *
 * Anything else → REJECT with reasons. Exit 0 on PROMOTE, 2 on REJECT
 * (CI-gateable). Holdout is measured, never fitted: this script only
 * reads it. Production artifacts are never replaced here — promotion
 * means a human (or a pinned follow-up) swaps the default.
 *
 * Usage: node lib/classify/eval/promote.mjs
 *   --candidate lib/classify/local/artifacts/feedback-v1
 *   [--baseline lib/classify/local/artifacts/gold]
 *   [--dataset lib/classify/eval/dataset-benchmark-v1.json]
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLocalMLProvider } from "../local/provider.mjs";
import { score } from "./score.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function referenceLabel(row) {
  return row.audit?.status === "audited" && row.audit.label ? row.audit.label : row.silverCategory;
}

async function evaluate(artifactDir, rows) {
  const provider = createLocalMLProvider({ artifactDir });
  const predictions = new Map();
  for (let i = 0; i < rows.length; i += 32) {
    const batch = rows.slice(i, i + 32);
    const results = await provider.classifyBatch(batch);
    for (const r of results) predictions.set(r.id, { label: r.label });
  }
  const full = score(predictions, rows);
  const holdoutRows = rows.filter((r) => r.split === "holdout");
  const holdout = score(predictions, holdoutRows);
  return {
    accuracy: full.accuracy,
    macroF1: full.macro?.f1 ?? null,
    holdoutAccuracy: holdout.accuracy,
    holdoutMacroF1: holdout.macro?.f1 ?? null,
    scored: full.scored,
  };
}

/**
 * No-regression rule (documented, not tuned): promote iff the candidate
 * meets or beats the baseline on macroF1, accuracy, AND holdout accuracy.
 * Exported for unit tests.
 */
export function decidePromotion(candidate, baseline) {
  const checks = [
    { name: "macroF1", ok: candidate.macroF1 !== null && baseline.macroF1 !== null && candidate.macroF1 >= baseline.macroF1, candidate: candidate.macroF1, baseline: baseline.macroF1 },
    { name: "accuracy", ok: candidate.accuracy !== null && baseline.accuracy !== null && candidate.accuracy >= baseline.accuracy, candidate: candidate.accuracy, baseline: baseline.accuracy },
    {
      name: "holdoutAccuracy",
      ok: candidate.holdoutAccuracy !== null && baseline.holdoutAccuracy !== null && candidate.holdoutAccuracy >= baseline.holdoutAccuracy,
      candidate: candidate.holdoutAccuracy,
      baseline: baseline.holdoutAccuracy,
    },
  ];
  return { verdict: checks.every((c) => c.ok) ? "PROMOTE" : "REJECT", checks };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const candidateDir = resolve(process.cwd(), get("--candidate", ""));
  const baselineDir = resolve(process.cwd(), get("--baseline", join(HERE, "..", "local", "artifacts", "gold")));
  const datasetPath = resolve(process.cwd(), get("--dataset", join(HERE, "dataset-benchmark-v1.json")));
  if (!get("--candidate", null)) throw new Error("--candidate artifact dir is required");

  const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
  console.log("evaluating baseline…");
  const baseline = await evaluate(baselineDir, dataset.rows);
  console.log("evaluating candidate…");
  const candidate = await evaluate(candidateDir, dataset.rows);

  const { verdict, checks } = decidePromotion(candidate, baseline);
  console.log(JSON.stringify({ verdict, checks, candidate, baseline }, null, 2));
  if (verdict === "REJECT") process.exitCode = 2;
}

// Importable for unit tests (decidePromotion) without side effects.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error(`promote failed: ${err.message}`);
    process.exitCode = 1;
  });
}
