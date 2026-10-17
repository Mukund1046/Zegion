# Gold audit guide — `dataset-v2.json`

You are establishing the trusted slice. The 1,440 existing Codex labels are
**silver**: useful for bootstrapping, never ground truth. Your audit labels
become the long-term benchmark and the only labels allowed to seed training
artifacts.

## How to audit

Each row has `audit: {status: "pending", label: null, note: ""}`.

1. Read `text` (and `links` where the text alone is ambiguous).
2. Set `audit.label` to the single best **canonical** label
   (`lib/classify/taxonomy.json`, version `experimental-001`), or one of:
   - `other` — valid post outside the current taxonomy (not a failure).
   - `uncertain` — you genuinely cannot decide between two labels.
     Name both in `note`, e.g. `"tool vs launch"`.
   - `unknown` — not enough evidence (empty text, image-only with no
     context, indecipherable).
3. Leave `unclassified` rows alone unless the content clearly fits a label.
4. Put reasoning doubts in `note` — boundary cases are the most valuable rows.
5. Set `audit.status` to `"audited"` when done with the row.

## Rules

- Judge the post's **primary intent**, not its keywords. "This new tool
  launches…" that announces a release is `launch`, not `tool`.
- Ignore engagement numbers, author fame, and your own interests.
- Multi-topic posts: pick the dominant intent; note the secondary in `note`.
- `silverCategory` is visible for reference only. When you disagree with it,
  you are probably right to — record `disagree-silver` in `note` so we can
  measure silver noise later.
- The `multilingual` coverage check is a known SHORTFALL (2 rows): do not
  invent multilingual robustness from this set; audit those 2 rows with
  extra care.

## Priority order (highest value first)

1. `stratum: "hard"` rows and `split: "holdout"` rows.
2. Near-boundary silver classes (`tool`/`launch`, `technique`/`opinion`).
3. `tail:*` rows (each is a rare-class witness).
4. Everything else.

## When finished

The audited slice (rows with `status: "audited"`) becomes `gold`. Everything
downstream — centroid v2 seeding, calibration, cascade thresholds — consumes
only gold until the harness justifies silver-weighted expansion.
