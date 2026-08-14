# HISTORY.md

Significant project evolution (architectural, not every commit). For commit-level detail use git.

- **2026-08** — Spatial renderer prototype work: continuous grid packing → per-card compositor fluid zoom → continuous camera (fluid default) → endpoint-normalized single settle → gesture-momentum settle seed → reading-card pin through the post-settle camera tail. FLUID-ZOOM INVARIANT established; counter-radius probe measured and rejected. (Commits `38165f7` → `1bf6f2f`.)
- **2026-08** — Security hardening: proxy headers, rate limiting, Zod validation, sanitized errors, API-key auth for non-localhost (commit `7c94918`).
- **2026-08** — Search command palette with prefix facets (`@author`, `#category`, `domain:`, `sites:`), separate domain/sites concepts, dialkit search font/hover/dark fixes (commits `16138fb`–`a1c6925`).
- **2026-08** — UI consolidation: sort picker removed, borderless buttons, overlay-pop bar, dialkit context menu, drawer + portaled dropdown, sync-settings accordion (commits `c17d62e`–`71dd18d`).
- **2026-08** — Zoom density control: gliding column transitions, spring velocity preservation, persistence (commits `6316e04`, `55aa825`).
- **2026-08** — Spatial motion rework: gliding layout transitions, stabilized transition ticker (commit `339c048`).
- **2026-07 (approx)** — Field Theory data pipeline: export + folder sync + config + server jobs. Category/domain classification via Field Theory + Codex.
- **2026-07 (approx)** — Original app: JSON-file bookmark viewer with media/card views, lightbox, filters, dark mode. Multiple design iterations on the lightbox, scrubber, and search.

## Derived decisions (see DECISIONS.md)

- Auth: browser-derived → manual fallback (D-08).
- Storage: JSON-file, local-first (D-07).
- Renderer engineering: pool + springs + profiler (D-11, D-14).
- Spatial: pure engine + compositor zoom + single settle (D-01…D-06).