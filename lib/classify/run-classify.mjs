/**
 * Staged classification runner: classifies unclassified FT bookmarks
 * through the provider service and stages results for review.
 *
 * SAFETY: this never writes to the FT store. Labels are uncalibrated until
 * the gold calibration work ratifies routing, so production application of
 * staged labels is a separate, explicitly gated step. Run records land in
 * data/output/classify-runs/ (gitignored generated data) and stdout ends
 * with a single RESULT JSON line for the server job to parse.
 *
 * Usage: node lib/classify/run-classify.mjs [--provider local-ml|opencode|regex]
 *   [--limit 200] [--batch-size 20] [--ids 123,456]
 * Debug/eval mode: --ids classifies exactly those bookmark ids (still read
 * from the store, still staged, never applied) so one selected bookmark's
 * full reasoning record can be inspected.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { openDb } from "../../node_modules/fieldtheory/dist/db.js";
import { twitterBookmarksIndexPath } from "../../node_modules/fieldtheory/dist/paths.js";
import { getOutputDir } from "../config.js";
import { classifyBatch, listProviders } from "./service.mjs";
import { getExcludedClassificationIds, recordStagedSuggestions } from "./workflow.mjs";
import { probeCliAuth } from "./opencode/cli.mjs";
import { healthTracker } from "./opencode/health.mjs";

const CLASSIFY_PROVIDERS = new Set(listProviders());
const require = createRequire(import.meta.url);
const { writeJsonAtomic } = require("../atomic-write.js");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--provider") out.provider = argv[i + 1];
    if (argv[i] === "--limit") out.limit = Number(argv[i + 1]);
    if (argv[i] === "--batch-size") out.batchSize = Number(argv[i + 1]);
    if (argv[i] === "--ids") out.ids = String(argv[i + 1] || "").split(",").map((s) => s.trim()).filter((s) => /^[0-9]+$/.test(s));
    if (argv[i] === "--run-id") out.runId = String(argv[i + 1] || "");
    if (argv[i] === "--status-path") out.statusPath = String(argv[i + 1] || "");
  }
  return out;
}

/** Preflight: fail fast with an actionable message before any work. */
function preflight(provider) {
  if (provider === "local-ml") {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "local", "artifacts", "gold", "centroids.json");
    if (!existsSync(dir)) {
      throw new Error(
        "Local classifier unavailable: gold centroids missing. Run node lib/classify/local/build-centroids-gold.mjs first."
      );
    }
    return;
  }
  if (provider === "opencode" && !process.env.OPENCODE_API_KEY) {
    const probe = probeCliAuth();
    if (!probe.ok) throw new Error(probe.reason);
  }
}

async function loadUnclassified(limit, ids = null, excludedIds = []) {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  try {
    let skipped = 0;
    if ((!ids || ids.length === 0) && excludedIds.length > 0) {
      const countStmt = db.prepare(
        `SELECT COUNT(*) AS count FROM bookmarks WHERE (primary_category = 'unclassified' OR primary_category IS NULL) AND CAST(id AS TEXT) IN (${excludedIds.map(() => "?").join(",")})`
      );
      const countRows = countStmt.bind(excludedIds);
      if (countRows.step()) skipped = Number(countRows.getAsObject().count || 0);
      countRows.free();
    }
    const clauses = [];
    const params = [];
    if (ids && ids.length > 0) {
      clauses.push(`id IN (${ids.map(() => "?").join(",")})`);
      params.push(...ids);
    } else {
      clauses.push(`(primary_category = 'unclassified' OR primary_category IS NULL)`);
      if (excludedIds.length > 0) {
        clauses.push(`CAST(id AS TEXT) NOT IN (${excludedIds.map(() => "?").join(",")})`);
        params.push(...excludedIds);
      }
    }
    const stmt = db.prepare(
      `SELECT id, text, author_handle, links_json FROM bookmarks WHERE ${clauses.join(" AND ")} ORDER BY RANDOM() LIMIT ${Math.max(1, Math.floor(limit))}`
    );
    const bound = params.length > 0 ? stmt.bind(params) : stmt;
    const rows = [];
    while (bound.step()) rows.push(bound.getAsObject());
    bound.free();
    const items = rows.map((r) => ({
      id: String(r.id),
      text: r.text || "",
      authorHandle: r.author_handle || "",
      links: (() => {
        try {
          return JSON.parse(r.links_json || "[]");
        } catch {
          return [];
        }
      })(),
    }));
    return { items, skipped };
  } finally {
    // sql.js Database has no close-with-save here (read-only use); release.
    if (typeof db.close === "function") {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = args.provider || process.env.X_CLASSIFY_PROVIDER || "local-ml";
  if (!CLASSIFY_PROVIDERS.has(provider)) {
    throw new Error(`Unknown provider "${provider}". Known: ${[...CLASSIFY_PROVIDERS].join(", ")}.`);
  }
  const limit = args.limit || Number(process.env.X_CLASSIFY_JOB_LIMIT) || 200;
  const batchSize = args.batchSize || Number(process.env.X_CLASSIFY_BATCH) || 20;
  const ids = args.ids && args.ids.length > 0 ? args.ids : null;

  preflight(provider);
  const excludedIds = ids ? [] : getExcludedClassificationIds(outDirForRuns());
  const loaded = await loadUnclassified(
    ids ? ids.length : limit,
    ids,
    excludedIds
  );
  const items = loaded.items;
  const runId = /^[a-zA-Z0-9_-]{1,80}$/.test(args.runId || "")
    ? args.runId
    : `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const statusPath = args.statusPath || null;
  const allResults = [];
  const telemetry = {
    provider,
    model: null,
    items: items.length,
    classified: 0,
    abstained: 0,
    unknown: 0,
    other: 0,
    uncertain: 0,
    invalid: 0,
    failures: 0,
    timeouts: 0,
    fallbackUsed: 0,
    latencyMs: 0,
    batches: 0,
    skipped: loaded.skipped,
  };
  const started = Date.now();
  const outDir = join(getOutputDir(), "classify-runs");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${runId}.json`);
  const writeStatus = (state, extra = {}) => {
    if (!statusPath) return;
    writeJsonAtomic(statusPath, {
      runId,
      state,
      pid: process.pid,
      provider,
      progress: { completed: 0, total: items.length },
      startedAt: new Date(started).toISOString(),
      updatedAt: new Date().toISOString(),
      ...extra,
    });
  };
  writeStatus("running");
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const { results, telemetry: t } = await classifyBatch(batch, { provider });
    telemetry.batches += 1;
    for (const key of ["classified", "abstained", "unknown", "other", "uncertain", "invalid", "failures", "timeouts", "fallbackUsed"]) {
      telemetry[key] += t[key];
    }
    if (!telemetry.model && t.model) telemetry.model = t.model;
    const batchResults = [];
    for (const r of results) {
      batchResults.push({
        id: r.id,
        label: r.label,
        outcome: r.status === "success" ? "suggestion" : r.status === "abstained" ? "abstained" : "failed",
        candidates: r.candidates,
        confidence: r.confidence,
        scores: r.scores ?? null,
        provider: r.provider,
        model: r.model,
        latencyMs: r.latencyMs,
        taxonomyVersion: r.taxonomyVersion,
        status: r.status,
        errorCode: r.errorCode,
        // Cascade debug record: full routing provenance per bookmark.
        decision: r.decision ?? null,
      });
    }
    const returnedIds = new Set(results.map((result) => String(result.id)));
    for (const item of batch) {
      if (!returnedIds.has(item.id)) {
        batchResults.push({
          id: item.id,
          label: null,
          outcome: t.failures > 0 ? "failed" : "abstained",
          status: t.failures > 0 ? "failed" : "abstained",
          errorCode: t.errorCode || (t.failures > 0 ? "provider-failure" : "omitted-result"),
          provider,
          taxonomyVersion: "experimental-001",
        });
      }
    }
    allResults.push(...batchResults);
    recordStagedSuggestions(outDir, runId, provider, batchResults);
    writeJsonAtomic(outPath, {
      runId,
      state: "running",
      provider,
      startedAt: new Date(started).toISOString(),
      telemetry: { ...telemetry },
      results: allResults,
    });
    writeStatus("running", {
      progress: { completed: Math.min(i + batch.length, items.length), total: items.length },
      telemetry: { ...telemetry },
    });
    if (process.env.X_CLASSIFY_PROGRESS !== "0") {
      process.stderr.write(`classify ${provider}: ${Math.min(i + batchSize, items.length)}/${items.length}\n`);
    }
  }
  telemetry.latencyMs = Date.now() - started;

  writeJsonAtomic(outPath, {
    runId,
    state: "complete",
    provider,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date().toISOString(),
    telemetry,
    providerHealth: healthTracker().snapshot(),
    results: allResults,
  });
  writeStatus("complete", {
    progress: { completed: items.length, total: items.length },
    telemetry,
    staged: outPath,
  });
  console.log(JSON.stringify({ ok: true, runId, staged: outPath, telemetry }));
}

function outDirForRuns() {
  return join(getOutputDir(), "classify-runs");
}

main().catch((err) => {
  console.error(`classify failed: ${err.message}`);
  process.exitCode = 1;
});
