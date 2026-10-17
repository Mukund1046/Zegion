/**
 * Evaluation strata definitions (shared by analysis scripts).
 *
 * A: all rows. B: coverable local-head rows (reference in the 10-head set).
 * C: other/unknown/uncertain reference rows (outside the local head).
 * D: per canonical class.
 * Splits (dev/holdout) compose with every stratum. Pure + unit-tested.
 */
import { getTaxonomy } from "../taxonomy.mjs";

export function headLabels() {
  const taxonomy = getTaxonomy();
  return new Set(taxonomy.canonical.filter((c) => !["other", "unclassified", "unknown", "uncertain"].includes(c)));
}

export function referenceOf(row) {
  return row.audit?.status === "audited" && row.audit.label ? row.audit.label : row.silverCategory;
}

/** Stratum key for one row reference label. */
export function stratumOf(ref, heads = headLabels()) {
  if (heads.has(ref)) return "B";
  if (ref === "other" || ref === "unknown" || ref === "uncertain") return "C";
  return "B-other";
}

/**
 * Partition rows into named, composable subsets.
 * @returns {{A: object[], B: object[], C: object[], dev: object[], holdout: object[], byClass: Map<string, object[]>}}
 */
export function partition(rows) {
  const out = { A: [...rows], B: [], C: [], dev: [], holdout: [], byClass: new Map() };
  for (const row of rows) {
    const ref = referenceOf(row);
    const s = stratumOf(ref);
    if (s === "B") out.B.push(row);
    else if (s === "C") out.C.push(row);
    if (row.split === "holdout") out.holdout.push(row);
    else out.dev.push(row);
    if (!out.byClass.has(ref)) out.byClass.set(ref, []);
    out.byClass.get(ref).push(row);
  }
  return out;
}
