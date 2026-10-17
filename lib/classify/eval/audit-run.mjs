/**
 * Production-audit workflow around staged cascade run records.
 *
 * Sample:  node lib/classify/eval/audit-run.mjs --sample <run.json>
 *            [--out production-audit.json] [--n 40]
 *   Stratified deterministic sample across decision sources × labels,
 *   joined with bookmark text/author from the FT store for context.
 *   Emits verdict slots (null until a human judges them).
 *
 * Tally:   node lib/classify/eval/audit-run.mjs --tally <audited.json>
 *   Verdicts: correct | wrong | ambiguous | insufficient-context.
 *   Reports rates overall + by source + by label, and groups wrong rows
 *   into recurring failure patterns for the next engineering decision.
 *   No thresholds, taxonomy, models, or training change here.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../../../node_modules/fieldtheory/dist/db.js";
import { twitterBookmarksIndexPath } from "../../../node_modules/fieldtheory/dist/paths.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
void ROOT;

export const VERDICTS = Object.freeze(["correct", "wrong", "ambiguous", "insufficient-context"]);

function loadTexts(ids) {
  const open = openDb(twitterBookmarksIndexPath());
  const openDbAwaited = open && typeof open.then === "function" ? open : Promise.resolve(open);
  return openDbAwaited.then((db) => {
    try {
      const quoted = [...ids].map((id) => `'${String(id).replace(/[^0-9]/g, "")}'`).join(",");
      const res = db.exec(`SELECT id, text, author_handle FROM bookmarks WHERE id IN (${quoted || "'-'"})`);
      const map = new Map();
      if (res.length && res[0].values) {
        for (const v of res[0].values) map.set(String(v[0]), { text: v[1] || "", authorHandle: v[2] || "" });
      }
      return map;
    } finally {
      if (typeof db.close === "function") {
        try {
          db.close();
        } catch {
          /* ignore */
        }
      }
    }
  });
}

function stridePick(sortedIds, count) {
  if (sortedIds.length <= count) return sortedIds;
  const step = sortedIds.length / count;
  const picked = [];
  for (let i = 0; i < count; i += 1) picked.push(sortedIds[Math.floor(i * step)]);
  return picked;
}

async function sampleRun(runPath, n, outPath) {
  const run = JSON.parse(readFileSync(resolve(process.cwd(), runPath), "utf8"));
  const groups = new Map(); // `${source}|${label}` -> ids
  for (const r of run.results) {
    const key = `${r.decision?.decisionSource || "?" }|${r.label}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r.id);
  }
  // Proportional allocation across strata (at least 1 per non-empty group).
  const picked = new Set();
  const groupKeys = [...groups.keys()].sort();
  const perGroup = Math.max(1, Math.floor(n / groupKeys.length));
  for (const key of groupKeys) {
    for (const id of stridePick([...groups.get(key)].sort(), perGroup)) picked.add(id);
  }
  // Fill remainder deterministically from largest groups.
  if (picked.size < n) {
    const bySize = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    outer: for (const [, ids] of bySize) {
      for (const id of [...ids].sort()) {
        if (picked.size >= n) break outer;
        picked.add(id);
      }
    }
  }
  const texts = await loadTexts(picked);
  const byId = new Map(run.results.map((r) => [r.id, r]));
  const worklist = [...picked].sort().map((id) => {
    const r = byId.get(id);
    const ctx = texts.get(id) || { text: "", authorHandle: "" };
    return {
      id,
      text: ctx.text,
      authorHandle: ctx.authorHandle,
      label: r.label,
      decision: r.decision,
      status: r.status,
      errorCode: r.errorCode,
      latencyMs: r.latencyMs,
      verdict: null,
      verdictNote: "",
    };
  });
  writeFileSync(outPath, JSON.stringify({ runId: run.runId, sampled: worklist.length, rows: worklist }, null, 2) + "\n");
  const strata = {};
  for (const r of worklist) {
    const key = `${r.decision?.decisionSource}|${r.label}`;
    strata[key] = (strata[key] || 0) + 1;
  }
  console.log(`sampled ${worklist.length} rows -> ${outPath}`);
  console.log(JSON.stringify(strata, null, 1));
}

function tallyData(data) {
  const rows = data.rows || data;
  let pending = 0;
  const counts = { correct: 0, wrong: 0, ambiguous: 0, "insufficient-context": 0 };
  const bySource = {};
  const byLabel = {};
  const wrong = [];
  for (const r of rows) {
    if (!r.verdict) {
      pending += 1;
      continue;
    }
    if (!VERDICTS.includes(r.verdict)) throw new Error(`invalid verdict ${JSON.stringify(r.verdict)} on ${r.id}`);
    counts[r.verdict] += 1;
    const src = r.decision?.decisionSource || "?";
    if (!bySource[src]) bySource[src] = { correct: 0, wrong: 0, ambiguous: 0, "insufficient-context": 0 };
    bySource[src][r.verdict] += 1;
    if (!byLabel[r.label]) byLabel[r.label] = { correct: 0, wrong: 0, ambiguous: 0, "insufficient-context": 0 };
    byLabel[r.label][r.verdict] += 1;
    if (r.verdict === "wrong") {
      wrong.push({
        id: r.id,
        label: r.label,
        source: src,
        local: r.decision?.localCandidate,
        zen: r.decision?.zenCandidate,
        margin: r.decision?.localMargin,
        reason: r.decision?.decisionReason,
        note: r.verdictNote,
        text: (r.text || "").slice(0, 200),
      });
    }
  }
  const judged = rows.length - pending;
  const report = {
    total: rows.length,
    pending,
    judged,
    overall: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, judged > 0 ? v / judged : null])),
    counts,
    bySource,
    byLabel,
    wrong,
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function tally(auditedPath) {
  const data = JSON.parse(readFileSync(resolve(process.cwd(), auditedPath), "utf8"));
  return tallyData(data);
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  if (args.includes("--sample")) {
    const runPath = get("--sample", "");
    const outPath = resolve(process.cwd(), get("--out", join(HERE, "..", "..", "..", "production-audit.json")));
    const n = Number(get("--n", "40")) || 40;
    await sampleRun(runPath, n, outPath);
  } else if (args.includes("--tally")) {
    tally(get("--tally", ""));
  } else {
    throw new Error("usage: audit-run.mjs --sample <run.json> [--out f] [--n 40] | --tally <audited.json>");
  }
}

// Importable (tally/VERDICTS) without side effects.
if (process.argv[1] && (await import("node:url")).pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error(`audit-run failed: ${err.message}`);
    process.exitCode = 1;
  });
}

export { tally, tallyData, VERDICTS as AUDIT_VERDICTS, stridePick };
