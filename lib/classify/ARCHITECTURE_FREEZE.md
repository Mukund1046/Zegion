# Classification architecture freeze

Frozen 2026-09-29. Production-validation mode: observe and audit, do not
re-architect. Any change below requires repeated production evidence from
audited runs (not theory, not a single audit).

## Frozen
- Taxonomy `experimental-001` (reversible raw→canonical map; raw data never rewritten)
- Margin bands `bands.json v1` (dev-fit; holdout evaluation-only)
- Cascade `cascade-v1` + evidence rules (content-free→unknown, thin→uncertain,
  tutorial tie-break/override) + `THIN_TOKEN_CUTOFF = 2`
- Providers: regex (FT, evidence-only) · local-ml gold-v2 (default) ·
  opencode chain `big-pickle → mimo-v2.6-flash → nemotron-3-ultra → ling-flash-fin`
- Four states distinct; failure is a status, never a label
- Frozen benchmark `dataset-benchmark-v1.json` + 68-row holdout (read-only)

## May change only on repeated audited evidence
- Models, taxonomy, thresholds, centroids, embeddings, cascade structure,
  Zen strategy, thin-evidence cutoff, tutorial cue list
- Each change needs: observed failure pattern across audits → targeted fix
  → regression tests → rerun comparison → benchmark gate green

## Never (without explicit approval)
- Spatial/feed/search/display/sync/auth/storage code paths
- Classification inside render, rAF, grid, or card layout
- Writing uncalibrated labels into the FT store
- Training on holdout, silver, or unreviewed Zen output
