# Zeleon Typography Tracking System

Reference + audit log for font tracking (CSS `letter-spacing`) in Zeleon.
Status: **tiers T1–T4 applied** (see §7 verification). `body` inheritance,
positive caps labels, DialKit ranges, and legacy sort-picker remain untouched
by design. Verify any future application in DevTools computed style, not just
source text.

Companion lookup: `node audit-tracking.mjs` (`--json` for machine output).

## 1. Research basis

Size-based tracking, per contemporary design-system practice
(Fonttrio/Core, Human, Cadence, Typography Master, loremforge guides):

- **Tracking tightens as type size grows.** Large glyphs look loose at default
  spacing; small text needs room to breathe.
- **Negative tracking belongs on headings/display only** (roughly
  `-0.035em…-0.01em` in the literature, scaled to size). Never on body text —
  it harms legibility and reads as an amateur mistake.
- **Body/small text stays neutral (`0`)**; small caps and micro-labels go
  **positive** (`+0.05em…+0.15em`), more so at smaller sizes.
- **Apple's San Francisco precedent matters here:** SF ships per-size
  *point* tracking values rather than ems — the direct ancestor of using
  **fixed px** tracking per size band, which is what this system does.
- `em` tracking scales with `font-size`, so a single em value drifts in px
  across sizes. Fixed px values compute exactly, which is why this system
  specifies px and verifies the *computed* value.

## 2. Current state (from `audit-tracking.mjs`)

- `body { letter-spacing: var(--tracking-normal) }` (`-0.01em`) is inherited
  by **everything** without its own rule. Effective tracking therefore drifts
  with size: 11px → `-0.11px`, 12px → `-0.12px`, 13px → `-0.13px`,
  14px → `-0.14px`, 16px → `-0.16px`, 20px → `-0.20px`.
- `--tracking-medium` (`-0.015em`) and `--tracking-semibold` (`-0.02em`)
  are defined but **consumed nowhere**.
- Explicit negative tracking exists in exactly two places:
  `.grid-item-card .grid-item-author` (`-0.01em` @ 14px = `-0.14px`) and the
  LOCKED drawer rule below.
- Positive tracking (`tracking-wide/widest`, `.sidebar-section-title`
  `0.04em`) is used for caps/count badges — correct per research, out of scope.
- The More-popover DialKit `letterSpacing` slider (`-2…2px`, default `0`)
  is user-controlled runtime state — out of scope.
- `assets/legacy/sort-picker` carries its own tracking dial — excluded
  (legacy, do not touch).

## 3. LOCKED — do not touch

| Selector | Value | Reason |
|---|---|---|
| `[data-slot="drawer-title"]` (`app/globals.css`) | `-0.1px` fixed | Drawer-header fix: 20px text inherited `-0.2px`; pinned to exactly `-0.1px`. Reference implementation for Tier T4. |

Also frozen: `body` tracking (`-0.01em`) stays as-is — changing it would
retune every text role in the app at once.

## 4. Tier system (negative band `-0.06px … -0.10px`; small text neutral `0`)

Fixed px, tighter as size/weight rise. Never tighter than `-0.10px`;
never negative on 16px regular body (see §6 deviation).

| Tier | Tracking | Size band | Roles / examples (from audit) |
|---|---|---|---|
| T4 Display | `-0.10px` | ≥20px, semibold+ | Drawer titles (**LOCKED ref impl**); `error.tsx`/`not-found.tsx` h2 `text-xl` semibold (candidates) |
| T3 Title | `-0.08px` | 16–18px, semibold | `error-boundary` h2 18px/600; dialog titles 16px; `sidebar-title` 16px/700 (verify weight before applying) |
| T2 UI | `-0.06px` | 14px, medium+ | Buttons, menu items, `grid-item-author` 14px/700 (currently `-0.14px`), search result names |
| T1 Small | `0` | 11–13px UI/meta — **neutral, never negative** | Card text 13px, `@handle` 12px, meta/counts 11–12px, kbd, mono handles (see §7 for deferred items) |

Em equivalents (reference only — system specifies px):
T4 ≈ `-0.005em` @20px · T3 ≈ `-0.005em` @16px · T2 ≈ `-0.0043em` @14px ·
T1/T-Body `0`. The negative band (`-0.06…-0.10px`) is deliberately subtler
than the inherited `-0.01em`, which is why small text currently looks
overtight (`-0.12…-0.16px`); small text goes fully neutral instead of merely
less tight, per the research consensus (decision: small fonts stay at `0`).

Sub-pixel note: browsers accumulate fractional spacing per glyph and DevTools
reports computed values to 2 decimals — always verify the computed value,
as was done for the drawer fix.

## 5. Application log (applied; verified in §8)

- T4: `[data-slot="drawer-title"]` (locked, pre-existing) + `error.tsx` /
  `not-found.tsx` h2 via co-located `tracking-[-0.1px]` (both `text-xl`
  semibold — exact T4 spec).
- T3: `error-boundary.tsx` h2 via inline `letterSpacing: "-0.08px"` (18px/600
  verified); `.sidebar-title` rule (16px/700 verified). **Deferred:**
  dialog titles are 16px but only `font-medium` — T3 requires semibold, so
  they stay inherited until a weight decision is made.
- T2: `.grid-item-card .grid-item-author` (`-0.01em` → `-0.06px`);
  `ui/button` base `tracking-[-0.06px]` (14px `font-medium` verified) with
  `tracking-[0px]` overrides on the `xs` (12px) and `sm` (12.8px) variants so
  they resolve to T1 instead; search-result names (`author.name`, category
  name, `bookmark.authorName` — all `text-sm font-medium`) via co-located
  `tracking-[-0.06px]`. **Deferred:** `reui/badge` (variants span 12px/14px
  with unverified weights — one rule can't serve both tiers).
- T1: one grouped rule — `.grid-item-card .grid-item-text` (13px),
  `.grid-item-card .grid-item-handle` (12px/500), `.brand-count` (11.5px),
  `.zoom-value` (11px), `.sidebar-filter-label` (~13px/600),
  `.sidebar-filter-count` (~12px), `[data-slot="kbd"]` (12px) — plus
  `letterSpacing: 0` in the shared `monoStyle` object (12px handles).
  Sizes 15px (`zoom-btn`) and 19px fall between bands and keep inheriting;
  `brand-title` (16px/700, future T3 candidate) intentionally left for now.

## 6. Application rules (for future tier work)

1. Scoped selectors only, one rule per role — never a global override, never
   on `body`.
2. Fixed `px`, never `em`, so the computed value is exact at any size.
3. Keep family, weight, size, line-height untouched — tracking-only edits.
4. Positive caps labels, DialKit ranges, and legacy sort-picker are out of scope.
5. Re-run `node audit-tracking.mjs` after applying; the report must show the
   role under "letter-spacing declarations" with the tier value, and DevTools
   must show the matching computed value.

## 7. Known deviations (intentionally not fixed in this pass)

- 16px regular body/long-form inherits `-0.16px` (research says body should
  be `0`). Fixing it means overriding `body` inheritance app-wide — needs its
  own decision, not smuggled into a tier rollout.
- `.lightbox-title` sets tracking `0` @16px (already neutral — consistent).
- `.spatial-title` `0.01em`, `.sidebar-section-title` `0.04em` are positive
  by design (labels) — correct, untouched.

## 8. Verification (computed values, live browser)

Method: Playwright + system Chrome against dev `localhost:3001`,
`getComputedStyle().letterSpacing` per element — never source text.
`[live]` = element rendered by the app; `[fixture]` = unmounted components
recreated with their exact source classes/selectors (identical cascade).
`normal` is how Chrome serializes computed `0` — it counts as `0px`, and on
`.brand-count` it proves the override beats the inherited `-0.12px`.

| Check | Expected | Actual | Via |
|---|---|---|---|
| drawer-title T4 (locked) | `-0.1px` | `-0.1px` | live (drawer opened) |
| card author T2 | `-0.06px` | `-0.06px` | fixture |
| card text / handle T1 | `0px` | `normal` | fixture |
| sidebar title T3 | `-0.08px` | `-0.08px` | fixture |
| sidebar filter label/count T1 | `0px` | `normal` | fixture |
| brand count T1 | `0px` | `normal` | live |
| zoom value T1 | `0px` | `normal` | fixture |
| ui/button base T2 | `-0.06px` | `-0.06px` | live |
| ui/button xs override T1 | `0px` | `normal` | fixture |
| body untouched | `-0.16px` | `-0.16px` | live |
| not-found h2 T4 | `-0.1px` | `-0.1px` | live (`/does-not-exist-xyz`) |

13/13 pass. Scratch verification scripts were removed after the run.
