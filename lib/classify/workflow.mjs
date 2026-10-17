import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import atomicWrite from "../atomic-write.js";

const { writeJsonAtomic } = atomicWrite;
// Resolve from the app runtime root instead of import.meta.url. Next's
// production Webpack build rewrites new URL(..., import.meta.url) to an asset
// URL object, which is not a valid fs path in the bundled server runtime.
const TAXONOMY = JSON.parse(
  readFileSync(join(process.cwd(), "lib", "classify", "taxonomy.json"), "utf8")
);
const REVIEW_LABELS = new Set([...TAXONOMY.canonical, "unknown", "uncertain"]);

export function readReviewLedger(runsDir) {
  const file = join(runsDir, "review-ledger.json");
  if (!existsSync(file)) return { version: 1, entries: {}, audit: [] };
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (value && value.version === 1 && value.entries && typeof value.entries === "object") return value;
    throw new Error("Classification review ledger format is invalid.");
  } catch {
    throw new Error("Classification review ledger is unreadable; restore it before continuing.");
  }
}

export function getExcludedClassificationIds(runsDir) {
  const ledger = readReviewLedger(runsDir);
  return Object.entries(ledger.entries)
    .filter(([, entry]) => ["pending", "applied", "dismissed"].includes(entry.status))
    .map(([id]) => id);
}

export function recordStagedSuggestions(runsDir, runId, provider, results) {
  const ledger = readReviewLedger(runsDir);
  const now = new Date().toISOString();
  for (const result of results) {
    if (result.outcome !== "suggestion" || result.status !== "success" || !result.label) continue;
    if (ledger.entries[result.id]?.status === "applied" || ledger.entries[result.id]?.status === "dismissed") continue;
    ledger.entries[result.id] = {
      status: "pending",
      runId,
      label: result.label,
      provider,
      stagedAt: now,
    };
  }
  writeJsonAtomic(join(runsDir, "review-ledger.json"), ledger);
  return ledger;
}

export function readClassificationRun(runsDir, runId) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(runId)) throw new Error("Invalid classification run id.");
  const file = join(runsDir, `${runId}.json`);
  if (!existsSync(file)) throw new Error("Classification run not found.");
  const run = JSON.parse(readFileSync(file, "utf8"));
  if (run.runId !== runId || !Array.isArray(run.results)) throw new Error("Classification run is invalid.");
  return run;
}

function readBookmarks(file) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(raw) ? raw : Array.isArray(raw.bookmarks) ? raw.bookmarks : [];
}

export function listClassificationRuns(runsDir, limit = 8) {
  const ledger = readReviewLedger(runsDir);
  let files = [];
  try {
    files = readdirSync(runsDir)
      .filter((name) => /^run-[a-zA-Z0-9_-]+\.json$/.test(name))
      .sort((a, b) => (statSync(join(runsDir, b)).mtimeMs - statSync(join(runsDir, a)).mtimeMs));
  } catch {
    return [];
  }
  return files.slice(0, limit).flatMap((name) => {
    try {
      const run = JSON.parse(readFileSync(join(runsDir, name), "utf8"));
      return [{
        runId: run.runId,
        provider: run.provider,
        state: run.state || "complete",
        startedAt: run.startedAt,
        completedAt: run.completedAt || null,
        telemetry: run.telemetry || {},
        results: (run.results || []).map((result) => ({
          ...result,
          reviewStatus: ledger.entries[String(result.id)]?.status || null,
        })),
      }];
    } catch {
      return [];
    }
  });
}

export function applyClassificationReview({ runsDir, runId, items, bookmarksPath }) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 500) {
    throw new Error("Select between 1 and 500 review items.");
  }
  const run = readClassificationRun(runsDir, runId);
  const ledger = readReviewLedger(runsDir);
  const bookmarks = readBookmarks(bookmarksPath);
  const byId = new Map(bookmarks.map((bookmark) => [String(bookmark.id), bookmark]));
  const suggestions = new Map(run.results
    .filter((result) => result.outcome === "suggestion" && result.status === "success")
    .map((result) => [String(result.id), result]));
  const applied = [];
  const conflicts = [];
  const now = new Date().toISOString();

  for (const item of items) {
    const id = String(item?.id || "");
    const suggestion = suggestions.get(id);
    const entry = ledger.entries[id];
    if (!/^[0-9]+$/.test(id) || !suggestion || suggestion.label !== item.label ||
        entry?.status !== "pending" || entry.runId !== runId) {
      conflicts.push({ id, reason: "not-pending-suggestion" });
      continue;
    }
    if (!REVIEW_LABELS.has(suggestion.label) || suggestion.label === "unclassified") {
      conflicts.push({ id, reason: "invalid-label" });
      continue;
    }
    const bookmark = byId.get(id);
    if (!bookmark || (bookmark.category && bookmark.category !== "unclassified")) {
      conflicts.push({ id, reason: "bookmark-already-classified-or-missing" });
      continue;
    }
    entry.status = "applied";
    entry.appliedAt = now;
    entry.previousCategory = bookmark.category || "unclassified";
    entry.appliedLabel = suggestion.label;
    applied.push({ id, label: suggestion.label });
  }

  if (applied.length) {
    ledger.audit ||= [];
    ledger.audit.push({ action: "apply", runId, at: now, items: applied });
    writeJsonAtomic(join(runsDir, "review-ledger.json"), ledger);
  }
  return { applied, conflicts };
}

export function dismissClassificationReview({ runsDir, runId, ids }) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 500) {
    throw new Error("Select between 1 and 500 review items.");
  }
  const ledger = readReviewLedger(runsDir);
  const dismissed = [];
  const conflicts = [];
  const now = new Date().toISOString();
  for (const rawId of ids) {
    const id = String(rawId);
    const entry = ledger.entries[id];
    if (!/^[0-9]+$/.test(id) || entry?.status !== "pending" || entry.runId !== runId) {
      conflicts.push({ id, reason: "not-pending-suggestion" });
      continue;
    }
    entry.status = "dismissed";
    entry.dismissedAt = now;
    dismissed.push(id);
  }
  if (dismissed.length) {
    ledger.audit ||= [];
    ledger.audit.push({ action: "dismiss", runId, at: now, ids: dismissed });
    writeJsonAtomic(join(runsDir, "review-ledger.json"), ledger);
  }
  return { dismissed, conflicts };
}

export function applyReviewedCategories(bookmarks, runsDir) {
  const ledger = readReviewLedger(runsDir);
  return bookmarks.map((bookmark) => {
    const entry = ledger.entries[String(bookmark.id)];
    if (entry?.status === "applied" && (!bookmark.category || bookmark.category === "unclassified")) {
      return { ...bookmark, category: entry.appliedLabel || entry.label };
    }
    return bookmark;
  });
}
