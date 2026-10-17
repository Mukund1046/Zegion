/**
 * Shadow-mode cascade comparison: regex-only vs local-only vs zen-only
 * vs cascade — on the frozen benchmark, without touching production.
 *
 * Inputs: frozen dataset + saved per-provider prediction maps
 * (--regex/--local/--zen preds files) + live local margins (recomputed
 * deterministically from the gold artifact for the cascade's band logic).
 * Zen predictions come from the saved full-run file (no new model calls).
 *
 * Reports accuracy/macroF1/coverage/abstention/per-class/confusions,
 * disagreement resolution, zenRequired invocation rate, and estimated
 * latency (measured local batch time + routed-fraction × measured Zen
 * batch time — an estimate, labeled as such).
 *
 * Usage: node lib/classify/cascade/shadow.mjs
 *   [--dataset lib/classify/eval/dataset-benchmark-v1.json]
 *   [--regex preds-regex.json] [--local preds-local.json] [--zen preds-spark.json]
 *   [--out shadow-cascade.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { score, referenceLabel } from "../eval/score.mjs";
import { createLocalMLProvider } from "../local/provider.mjs";
import { route, terminalMap, CASCADE_VERSION } from "./cascade.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadPreds(path) {
  const data = JSON.parse(readFileSync(path, "utf8")).preds;
  const key = Object.keys(data)[0];
  return new Map(Object.entries(data[key]));
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const root = resolve(HERE, "..", "..", "..");
  const dataset = JSON.parse(readFileSync(resolve(process.cwd(), get("--dataset", join(HERE, "..", "eval", "dataset-benchmark-v1.json"))), "utf8"));
  const regexPreds = loadPreds(resolve(process.cwd(), get("--regex", join(root, "preds-regex.json"))));
  const localPreds = loadPreds(resolve(process.cwd(), get("--local", join(root, "preds-local.json"))));
  const zenPreds = loadPreds(resolve(process.cwd(), get("--zen", join(root, "preds-spark.json"))));
  const outPath = resolve(process.cwd(), get("--out", join(root, "shadow-cascade.json")));

  const gates = JSON.parse(readFileSync(join(HERE, "regex-gates.json"), "utf8"));
  const bands = JSON.parse(readFileSync(join(HERE, "bands.json"), "utf8"));
  const config = { terminalLabels: terminalMap(gates), bands };
  const rows = dataset.rows;

  // Live local margins (deterministic rerun over the gold artifact).
  const provider = createLocalMLProvider();
  const margins = new Map();
  const locals = new Map();
  for (let i = 0; i < rows.length; i += 32) {
    const batch = rows.slice(i, i + 32);
    const results = await provider.classifyBatch(batch);
    for (const r of results) {
      locals.set(r.id, r.label);
      const ranked = Object.entries(r.scores || {}).sort((a, b) => b[1] - a[1]);
      margins.set(r.id, {
        label: r.label,
        margin: ranked.length > 1 ? ranked[0][1] - ranked[1][1] : null,
        candidates: ranked.map(([label]) => label),
      });
    }
    console.log(`shadow margins: ${Math.min(i + 32, rows.length)}/${rows.length}`);
  }

  // Cascade decisions (shadow: Zen evidence comes from the saved full run).
  const toMap = (predMap) => new Map([...predMap.entries()].map(([id, label]) => [id, { label }]));
  const cascadePreds = new Map();
  const sources = {};
  let zenRequired = 0;
  for (const row of rows) {
    const m = margins.get(row.id);
    if (!m) continue;
    const decision = route(
      {
        regexLabel: regexPreds.get(row.id) ?? null,
        localLabel: m.label,
        localMargin: m.margin,
        localCandidates: m.candidates,
        zenLabel: zenPreds.get(row.id) ?? null,
        zenStatus: zenPreds.has(row.id) ? "success" : "failed",
      },
      config
    );
    cascadePreds.set(row.id, { label: decision.label });
    const src = decision.provenance.decisionSource;
    sources[src] = (sources[src] || 0) + 1;
    if (decision.provenance.zenRequired) zenRequired += 1;
  }

  // System comparison on identical rows and metrics.
  const systems = {
    regex: score(new Map([...regexPreds.entries()].map(([id, label]) => [id, { label }])), rows),
    local: score(toMap(locals), rows),
    zen: score(new Map([...zenPreds.entries()].map(([id, label]) => [id, { label }])), rows),
    cascade: score(cascadePreds, rows),
  };
  // Holdout slices for each system.
  const holdoutRows = rows.filter((r) => r.split === "holdout");
  const holdout = {};
  for (const [name, predMap] of [["regex", regexPreds], ["local", locals], ["zen", zenPreds]]) {
    const s = score(new Map([...predMap.entries()].map(([id, label]) => [id, { label }])), holdoutRows);
    holdout[name] = { accuracy: s.accuracy, macroF1: s.macro.f1, scored: s.scored, items: holdoutRows.length };
  }
  const cascadeHoldout = score(cascadePreds, holdoutRows);

  // Estimated latency: measured local full-run time + routed fraction ×
  // measured Zen full-run time (both from prior benchmark reports).
  const report = {
    generatedAt: new Date().toISOString(),
    cascadeVersion: CASCADE_VERSION,
    dataset: dataset.version,
    rows: rows.length,
    systems: Object.fromEntries(
      Object.entries(systems).map(([name, s]) => [
        name,
        {
          accuracy: s.accuracy,
          microF1: s.micro.f1,
          macroF1: s.macro.f1,
          coverableAccuracy: s.coverableAccuracy,
          scored: s.scored,
          invalid: s.invalid,
          abstained: s.abstained,
          classes: s.classes,
          topConfusions: s.topConfusions,
        },
      ])
    ),
    holdout: {
      ...holdout,
      cascade: {
        accuracy: cascadeHoldout.accuracy,
        macroF1: cascadeHoldout.macro.f1,
        scored: cascadeHoldout.scored,
        items: holdoutRows.length,
      },
    },
    cascadeSources: sources,
    zenRequired,
    zenInvocationRate: rows.length > 0 ? zenRequired / rows.length : null,
  };
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`wrote ${outPath}`);
  for (const [name, s] of Object.entries(report.systems)) {
    console.log(`${name}: acc=${pct(s.accuracy)} macroF1=${pct(s.macroF1)} scored=${s.scored}`);
  }
  console.log(`cascade sources: ${JSON.stringify(sources)} zenRequired=${zenRequired}/${rows.length}`);

  function pct(v) {
    return v === null ? "n/a" : (100 * v).toFixed(1) + "%";
  }
}

main().catch((err) => {
  console.error(`shadow failed: ${err.message}`);
  process.exitCode = 1;
});
