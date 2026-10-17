/**
 * Derive per-class local margin bands from DEV rows only.
 *
 * Refuses to touch holdout rows (asserts split !== "holdout" on every
 * input). Classes without enough evidence get arbitration-only bands —
 * never an invented threshold.
 *
 * Band semantics per class:
 * - high: margin >= highAt → accept (dev precision above >= target)
 * - abstain: margin < abstainBelow → abstain (dev precision below < 0.5),
 *   or null when unsupported → everything else arbitrates
 * - arbitration: everything between (or everything, when unsupported)
 *
 * Usage: node lib/classify/cascade/derive-bands.mjs
 *   [--dataset lib/classify/eval/dataset-benchmark-v1.json]
 *   [--out lib/classify/cascade/bands.json]
 *   [--target 0.85] [--min-class-support 8] [--min-above 5]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalMLProvider } from "../local/provider.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function precisionAbove(rows, threshold) {
  const above = rows.filter((r) => r.margin >= threshold);
  if (above.length === 0) return { precision: null, n: 0 };
  return { precision: above.filter((r) => r.correct).length / above.length, n: above.length };
}

function precisionBelow(rows, threshold) {
  const below = rows.filter((r) => r.margin < threshold);
  if (below.length === 0) return { precision: null, n: 0 };
  return { precision: below.filter((r) => r.correct).length / below.length, n: below.length };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const datasetPath = resolve(process.cwd(), get("--dataset", join(HERE, "..", "eval", "dataset-benchmark-v1.json")));
  const outPath = resolve(process.cwd(), get("--out", join(HERE, "bands.json")));
  const target = Number(get("--target", "0.85")) || 0.85;
  const minClassSupport = Number(get("--min-class-support", "8")) || 8;
  const minAbove = Number(get("--min-above", "5")) || 5;

  const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
  const devRows = dataset.rows.filter((r) => r.split !== "holdout");
  if (devRows.some((r) => r.split === "holdout")) throw new Error("holdout leak in band derivation input");
  if (devRows.length === 0) throw new Error("no dev rows");

  const provider = createLocalMLProvider();
  const margins = []; // {trueLabel, predictedLabel, margin, correct}
  for (let i = 0; i < devRows.length; i += 32) {
    const batch = devRows.slice(i, i + 32);
    const results = await provider.classifyBatch(batch);
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const row of batch) {
      const r = byId.get(row.id);
      if (!r) continue;
      const ranked = Object.entries(r.scores || {}).sort((a, b) => b[1] - a[1]);
      if (ranked.length < 2) continue;
      const ref = row.audit?.label;
      margins.push({
        trueLabel: ref,
        predictedLabel: r.label,
        margin: ranked[0][1] - ranked[1][1],
        correct: r.label === ref,
      });
    }
    console.log(`derive-bands: ${Math.min(i + 32, devRows.length)}/${devRows.length}`);
  }

  const byPredicted = new Map();
  for (const m of margins) {
    if (!byPredicted.has(m.predictedLabel)) byPredicted.set(m.predictedLabel, []);
    byPredicted.get(m.predictedLabel).push(m);
  }

  const classes = {};
  for (const [label, rows] of byPredicted) {
    const support = rows.length;
    if (support < minClassSupport) {
      classes[label] = {
        mode: "arbitration-only",
        reason: `support ${support} < ${minClassSupport}: no threshold invented`,
        support,
      };
      continue;
    }
    // Highest threshold meeting target precision with minimum count.
    const candidates = [...new Set(rows.map((r) => r.margin))].sort((a, b) => b - a);
    let highAt = null;
    let highStats = null;
    for (const t of candidates) {
      const s = precisionAbove(rows, t);
      if (s.n >= minAbove && s.precision !== null && s.precision >= target) {
        highAt = t;
        highStats = s;
      } else if (s.n >= minAbove) {
        break; // precision fell below target going down — stop, keep highest
      }
    }
    // Abstain floor: margin below which dev precision < 0.5 (min count).
    let abstainBelow = null;
    let abstainStats = null;
    const ascending = [...candidates].sort((a, b) => a - b);
    for (const t of ascending) {
      const s = precisionBelow(rows, t);
      if (s.n >= minAbove && s.precision !== null && s.precision < 0.5) {
        abstainBelow = t;
        abstainStats = s;
      } else if (s.n >= minAbove) {
        break;
      }
    }
    classes[label] = {
      mode: highAt !== null ? "banded" : "arbitration-only",
      highAt,
      highPrecision: highStats?.precision ?? null,
      highN: highStats?.n ?? 0,
      abstainBelow,
      abstainPrecision: abstainStats?.precision ?? null,
      abstainN: abstainStats?.n ?? 0,
      support,
      target,
    };
  }

  const bands = {
    version: "v1",
    generatedAt: new Date().toISOString(),
    source: "dev-only local-v2 margins on dataset-benchmark-v1.json (holdout excluded by assertion)",
    targetPrecision: target,
    minClassSupport,
    minAbove,
    fallback: "arbitration",
    classes,
  };
  writeFileSync(outPath, JSON.stringify(bands, null, 2) + "\n");
  console.log(`wrote ${outPath}`);
  for (const [label, c] of Object.entries(classes)) {
    console.log(`  ${label}: mode=${c.mode} support=${c.support}` +
      (c.mode === "banded" ? ` high>=${c.highAt.toFixed(4)} (p=${c.highPrecision.toFixed(2)} n=${c.highN})` : "") +
      (c.abstainBelow !== null && c.abstainBelow !== undefined ? ` abstain<${c.abstainBelow.toFixed(4)} (p=${c.abstainPrecision.toFixed(2)} n=${c.abstainN})` : ""));
  }
}

main().catch((err) => {
  console.error(`derive-bands failed: ${err.message}`);
  process.exitCode = 1;
});
