/**
 * Generate regex terminal gates from GOLD-measured per-label precision.
 *
 * Promotion rule (conservative by design): a predicted label becomes a
 * terminal gate only with precision === 1.0 over at least MIN_SUPPORT
 * predictions. Anything else stays evidence. If nothing qualifies, the
 * terminal list is EMPTY — regex remains pure evidence, which is itself
 * a measured outcome, not a failure.
 *
 * Usage: node lib/classify/cascade/gen-regex-gates.mjs
 *   [--report harness-regex.json] [--out lib/classify/cascade/regex-gates.json]
 *   [--min-support 5]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const reportPath = resolve(process.cwd(), get("--report", join(HERE, "..", "..", "..", "harness-regex.json")));
  const outPath = resolve(process.cwd(), get("--out", join(HERE, "regex-gates.json")));
  const minSupport = Number(get("--min-support", "5")) || 5;

  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const provider = report.providers?.regex;
  if (!provider) throw new Error("regex provider report missing");
  const terminal = [];
  const measured = [];
  for (const c of provider.classes || []) {
    const predicted = c.precision !== null && c.precision > 0
      ? Math.round((c.recall ?? 0) * c.support / c.precision)
      : 0;
    measured.push({ label: c.label, precision: c.precision, recall: c.recall, predicted, support: c.support });
    if (c.precision === 1 && predicted >= minSupport) {
      terminal.push({
        ruleId: `regex-primary-${c.label}`,
        label: c.label,
        precision: c.precision,
        coverage: predicted,
        evidence: `gold benchmark: ${predicted}/${predicted} correct on ${report.dataset}`,
        taxonomyVersion: "experimental-001",
      });
    }
  }
  const gates = {
    version: "v1",
    generatedAt: new Date().toISOString(),
    source: "gold benchmark per-label precision (harness-regex.json)",
    promotionRule: `precision === 1.0 AND predicted >= ${minSupport}`,
    terminal,
    measured,
    note: terminal.length === 0
      ? "No label met the promotion rule: regex stays pure evidence in cascade v1."
      : `${terminal.length} terminal gate(s) promoted on measured evidence.`,
  };
  writeFileSync(outPath, JSON.stringify(gates, null, 2) + "\n");
  console.log(`terminal gates: ${terminal.length} -> ${outPath}`);
  for (const m of measured) {
    console.log(`  ${m.label}: precision=${m.precision === null ? "n/a" : m.precision.toFixed(2)} predicted=${m.predicted} support=${m.support}`);
  }
}

main();
