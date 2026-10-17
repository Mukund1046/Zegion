/**
 * Dataset v2 builder: stratified sample + duplicate groups + temporal split
 * + language signals + representativeness coverage report.
 *
 * Deterministic (id-sorted stride, no RNG): reruns produce the identical set.
 * Coverage constraints are REPORTED, never faked — a SHORTFALL line means
 * the corpus cannot satisfy that constraint at this sample size.
 *
 * Usage: node lib/classify/eval/build-dataset-v2.mjs [--limit 2000]
 *   [--out lib/classify/eval/dataset-v2.json] [--near-threshold 0.97]
 *   [--skip-near] [--holdout-frac 0.3]
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEntries } from "./store.mjs";
import { exactDupGroups, nearDupPairs, unionComponents } from "./dedup.mjs";
import { embedTexts } from "../local/embed.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HEAD_PER_CLASS = 12;
const MID_PER_CLASS = 8;
const UNCLASSIFIED_COUNT = 25;
const HARD_COUNT = 20;

const SCRIPT_RANGES = [
  ["latin", /[A-Za-z]/],
  ["cyrillic", /[\u0400-\u04FF]/],
  ["cjk", /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/],
  ["arabic", /[\u0600-\u06FF]/],
  ["devanagari", /[\u0900-\u097F]/],
];

/** Lightweight language signal: non-Latin share + scripts present. No dependency. */
export function languageSignal(text) {
  const chars = [...String(text ?? "")];
  if (chars.length === 0) return { nonLatinShare: 0, scripts: [] };
  let nonLatin = 0;
  const scripts = new Set();
  for (const ch of chars) {
    if (/\s/.test(ch)) continue;
    let matched = false;
    for (const [name, re] of SCRIPT_RANGES) {
      if (re.test(ch)) {
        scripts.add(name);
        if (name !== "latin") nonLatin += 1;
        matched = true;
        break;
      }
    }
    if (!matched && /[^\d\p{P}\p{S}]/u.test(ch)) nonLatin += 1;
  }
  const letters = chars.filter((c) => !/\s/.test(c)).length || 1;
  return { nonLatinShare: nonLatin / letters, scripts: [...scripts].sort() };
}

function stridePick(sorted, count) {
  if (sorted.length <= count) return sorted;
  const step = sorted.length / count;
  const picked = [];
  for (let i = 0; i < count; i += 1) picked.push(sorted[Math.floor(i * step)]);
  return picked;
}

function isHard(entry) {
  const text = (entry.text || "").trim();
  if (text.length === 0) return true;
  if (text.length < 50) return true;
  if (/^@\w/.test(text)) return true;
  if ((text.match(/https?:\/\//g) || []).length >= 2) return true;
  if (/```|function |const .*=|def |import .*from/i.test(text)) return true;
  return false;
}

function toRow(entry, stratum, dupGroupId) {
  return {
    id: entry.id,
    text: entry.text || "",
    authorHandle: entry.authorHandle || "",
    links: entry.links || [],
    mediaCount: entry.mediaCount || 0,
    postedAt: entry.postedAt || null,
    silverCategory: entry.primaryCategory || "unclassified",
    silverDomain: entry.primaryDomain || null,
    stratum,
    language: languageSignal(entry.text || ""),
    dupGroupId,
    split: "dev",
    audit: { status: "pending", label: null, note: "" },
  };
}

/** Representativeness constraints: each reports PASS or SHORTFALL with numbers. */
function checkCoverage(rows) {
  const checks = [];
  const bySilver = new Map();
  for (const r of rows) {
    if (!bySilver.has(r.silverCategory)) bySilver.set(r.silverCategory, []);
    bySilver.get(r.silverCategory).push(r);
  }
  const headNeeds = ["technique", "tool", "launch", "design", "opinion"];
  for (const c of headNeeds) {
    const n = bySilver.get(c)?.length || 0;
    checks.push({ constraint: `head-class:${c}>=8`, status: n >= 8 ? "PASS" : "SHORTFALL", actual: n });
  }
  const tailObserved = [...bySilver.keys()].filter(
    (c) => !headNeeds.includes(c) && c !== "unclassified"
  );
  checks.push({ constraint: "tail-classes-present", status: tailObserved.length >= 10 ? "PASS" : "SHORTFALL", actual: tailObserved.length });
  const ambiguous = rows.filter((r) => r.stratum === "hard" || r.silverCategory === "unclassified").length;
  checks.push({ constraint: "ambiguous>=30", status: ambiguous >= 30 ? "PASS" : "SHORTFALL", actual: ambiguous });
  const linkHeavy = rows.filter((r) => (r.links?.length || 0) > 0 || r.mediaCount > 0).length;
  checks.push({ constraint: "url-or-media>=40", status: linkHeavy >= 40 ? "PASS" : "SHORTFALL", actual: linkHeavy });
  const multilingual = rows.filter((r) => r.language.nonLatinShare > 0.3).length;
  checks.push({ constraint: "multilingual>=5", status: multilingual >= 5 ? "PASS" : "SHORTFALL", actual: multilingual });
  const boundaryCats = ["tool", "launch", "technique", "opinion", "design"];
  const boundary = rows.filter((r) => boundaryCats.includes(r.silverCategory)).length;
  checks.push({ constraint: "near-boundary>=40", status: boundary >= 40 ? "PASS" : "SHORTFALL", actual: boundary });
  return checks;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const limit = Number(get("--limit", "2000")) || 2000;
  const outPath = resolve(process.cwd(), get("--out", join(HERE, "dataset-v2.json")));
  const nearThreshold = Number(get("--near-threshold", "0.97")) || 0.97;
  const skipNear = args.includes("--skip-near");
  const holdoutFrac = Number(get("--holdout-frac", "0.3")) || 0.3;

  const entries = loadEntries(limit);

  // Exact-dup groups across the whole corpus (fast, no model).
  const { groups: exactGroups, groupOf } = exactDupGroups(entries);
  const dupRows = exactGroups.reduce((n, g) => n + g.ids.length, 0);
  console.log(`corpus=${entries.length} exact-dup-groups=${exactGroups.length} rows-in-groups=${dupRows}`);

  // Stratified pick (same recipe as v1 for comparability).
  const labeled = entries.filter((e) => (e.primaryCategory || "unclassified") !== "unclassified");
  const counts = new Map();
  for (const e of labeled) counts.set(e.primaryCategory, (counts.get(e.primaryCategory) || 0) + 1);
  const head = [...counts.entries()].filter(([, n]) => n >= 50).map(([c]) => c);
  const mid = [...counts.entries()].filter(([, n]) => n >= 10 && n < 50).map(([c]) => c);
  const tail = [...counts.entries()].filter(([, n]) => n < 10).map(([c]) => c);
  const used = new Set();
  const picked = [];
  const take = (list, count, stratum) => {
    const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
    const step = sorted.length <= count ? 1 : sorted.length / count;
    const n = Math.min(count, sorted.length);
    for (let i = 0; i < n; i += 1) {
      const e = sorted[Math.floor(i * step)];
      if (used.has(e.id)) continue;
      used.add(e.id);
      picked.push({ entry: e, stratum });
    }
  };
  for (const c of head) take(labeled.filter((e) => e.primaryCategory === c), HEAD_PER_CLASS, `head:${c}`);
  for (const c of mid) take(labeled.filter((e) => e.primaryCategory === c), MID_PER_CLASS, `mid:${c}`);
  for (const c of tail) take(labeled.filter((e) => e.primaryCategory === c), Number.MAX_SAFE_INTEGER, `tail:${c}`);
  take(entries.filter((e) => (e.primaryCategory || "unclassified") === "unclassified"), UNCLASSIFIED_COUNT, "unclassified");
  take(entries.filter((e) => !used.has(e.id) && isHard(e)), HARD_COUNT, "hard");

  // Near-dup pairs within the picked rows (embeddings), unioned with exact groups.
  let nearPairs = [];
  if (!skipNear) {
    const vectors = await embedTexts(picked.map((p) => p.entry.text || ""));
    nearPairs = nearDupPairs(picked.map((p) => ({ id: p.entry.id })), vectors, nearThreshold);
    console.log(`near-dup pairs (threshold ${nearThreshold}): ${nearPairs.length}`);
  }
  const exactInScope = exactGroups
    .map((g) => ({ ...g, ids: g.ids.filter((id) => used.has(id)) }))
    .filter((g) => g.ids.length > 1);
  const components = unionComponents(exactInScope, nearPairs);
  const inComponent = new Set(components.flat());
  console.log(`dup components in scope: ${components.length} (${inComponent.size} rows)`);

  // Temporal split: latest holdoutFrac by postedAt → holdout, components kept whole.
  const byId = new Map(picked.map((p) => [p.entry.id, p]));
  const dated = picked
    .map((p) => ({ id: p.entry.id, t: p.entry.postedAt ? Date.parse(p.entry.postedAt) : Number.NaN }))
    .sort((a, b) => (Number.isNaN(a.t) ? -1 : Number.isNaN(b.t) ? 1 : a.t - b.t));
  const holdoutTarget = Math.round(picked.length * holdoutFrac);
  const holdout = new Set();
  // Walk newest-first, pulling whole components, until the target is met.
  const compOf = new Map();
  for (const comp of components) for (const id of comp) compOf.set(id, comp);
  for (let i = dated.length - 1; i >= 0 && holdout.size < holdoutTarget; i -= 1) {
    const id = dated[i].id;
    if (holdout.has(id)) continue;
    const comp = compOf.get(id) || [id];
    for (const member of comp) holdout.add(member);
  }

  const rows = picked.map(({ entry, stratum }) => ({
    ...toRow(entry, stratum, groupOf.get(entry.id) ?? null),
    split: holdout.has(entry.id) ? "holdout" : "dev",
  }));

  const langDist = {};
  for (const r of rows) {
    const key = r.language.scripts.join("+") || "none";
    langDist[key] = (langDist[key] || 0) + 1;
  }
  const splitCounts = { dev: 0, holdout: 0 };
  for (const r of rows) splitCounts[r.split] += 1;
  const coverage = checkCoverage(rows);

  const dataset = {
    version: "v2",
    builtAt: new Date().toISOString(),
    source: `ft list --limit ${limit} (${entries.length} entries)`,
    splitRule: `latest ${holdoutFrac * 100}% by postedAt → holdout (dup components kept whole)`,
    nearDupThreshold: skipNear ? null : nearThreshold,
    counts: { rows: rows.length, dev: splitCounts.dev, holdout: splitCounts.holdout },
    languageDistribution: langDist,
    coverage,
    rows,
  };
  writeFileSync(outPath, JSON.stringify(dataset, null, 2) + "\n");
  console.log(`wrote ${rows.length} rows (dev=${splitCounts.dev} holdout=${splitCounts.holdout}) -> ${outPath}`);
  for (const c of coverage) console.log(`${c.status} ${c.constraint} (actual=${c.actual})`);
}

// Importable for unit tests (languageSignal) without side effects.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error(`build-dataset-v2 failed: ${err.message}`);
    process.exitCode = 1;
  });
}
