/**
 * Build the stratified evaluation dataset from the FT store.
 *
 * Deterministic (no RNG): within each stratum, entries are sorted by id and
 * picked at even stride, so reruns produce the identical set.
 *
 * Every row carries `audit: {status: "pending", label: null, note: ""}`.
 * The manual audit pass fills in trusted labels — that audited slice becomes
 * the long-term benchmark. Silver labels are bootstrapping only.
 *
 * Usage: node lib/classify/eval/build-dataset.mjs [--limit 2000] [--out lib/classify/eval/dataset.json]
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEntries } from "./store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const HEAD_PER_CLASS = 12;
const MID_PER_CLASS = 8;
const UNCLASSIFIED_COUNT = 25;
const HARD_COUNT = 20;

function stridePick(sorted, count) {
  if (sorted.length <= count) return sorted;
  const step = sorted.length / count;
  const picked = [];
  for (let i = 0; i < count; i += 1) picked.push(sorted[Math.floor(i * step)]);
  return picked;
}

function toRow(entry, stratum) {
  return {
    id: entry.id,
    text: entry.text || "",
    authorHandle: entry.authorHandle || "",
    links: entry.links || [],
    silverCategory: entry.primaryCategory || "unclassified",
    silverDomain: entry.primaryDomain || null,
    stratum,
    audit: { status: "pending", label: null, note: "" },
  };
}

/** Deliberately hard rows: tiny texts, mention-first, link-heavy, code-heavy. */
function isHard(entry) {
  const text = (entry.text || "").trim();
  if (text.length === 0) return true;
  if (text.length < 50) return true;
  if (/^@\w/.test(text)) return true;
  if ((text.match(/https?:\/\//g) || []).length >= 2) return true;
  if (/```|function |const .*=|def |import .*from/i.test(text)) return true;
  return false;
}

function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const outIdx = args.indexOf("--out");
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) || 2000 : 2000;
  const outPath = outIdx !== -1
    ? resolve(process.cwd(), args[outIdx + 1])
    : join(HERE, "dataset.json");

  const entries = loadEntries(limit);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const used = new Set();
  const rows = [];

  const take = (list, count, stratum) => {
    const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const e of stridePick(sorted, count)) {
      if (used.has(e.id)) continue;
      used.add(e.id);
      rows.push(toRow(e, stratum));
    }
  };

  const labeled = entries.filter((e) => (e.primaryCategory || "unclassified") !== "unclassified");
  const counts = new Map();
  for (const e of labeled) {
    const c = e.primaryCategory;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  const head = [...counts.entries()].filter(([, n]) => n >= 50).map(([c]) => c);
  const mid = [...counts.entries()].filter(([, n]) => n >= 10 && n < 50).map(([c]) => c);
  const tail = [...counts.entries()].filter(([, n]) => n < 10).map(([c]) => c);

  for (const c of head) take(labeled.filter((e) => e.primaryCategory === c), HEAD_PER_CLASS, `head:${c}`);
  for (const c of mid) take(labeled.filter((e) => e.primaryCategory === c), MID_PER_CLASS, `mid:${c}`);
  for (const c of tail) take(labeled.filter((e) => e.primaryCategory === c), Number.MAX_SAFE_INTEGER, `tail:${c}`);

  const unclassified = entries.filter((e) => (e.primaryCategory || "unclassified") === "unclassified");
  take(unclassified, UNCLASSIFIED_COUNT, "unclassified");

  const hardPool = entries.filter((e) => !used.has(e.id) && isHard(e));
  take(hardPool, HARD_COUNT, "hard");

  // Keep ids for traceability; drop the full map (dataset stays review-sized).
  const dataset = {
    version: "v1",
    builtAt: new Date().toISOString(),
    source: `ft list --limit ${limit} (${entries.length} entries)`,
    counts: { rows: rows.length, usedIds: used.size },
    rows,
  };
  void byId;
  writeFileSync(outPath, JSON.stringify(dataset, null, 2) + "\n");
  const strata = {};
  for (const r of rows) strata[r.stratum] = (strata[r.stratum] || 0) + 1;
  console.log(`wrote ${rows.length} rows -> ${outPath}`);
  console.log(JSON.stringify(strata, null, 2));
}

main();
