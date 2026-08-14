# DECISIONS.md

ADR-style decision log. Statuses: `ACCEPTED`, `SUPERSEDED`, `REJECTED`. Related docs linked where relevant.

---

## D-01 — Fluid zoom is a compositor-only operation (FLUID-ZOOM INVARIANT)

- **Status:** ACCEPTED
- **Date:** 2026-08 (current spatial work)
- **Context:** During a spatial zoom gesture the layout freezes as an inert surface and the camera alone magnifies it. Any per-frame mutation of inherited properties consumed by card descendants would force style recalc + repaint of every card each frame.
- **Decision:** While `mode === "scale"`, the frame is compositor-only. The ONLY per-frame card write is the compositor `transform` in `dom-renderer.ts`. New geometry is baked once on the flip to `screen`. No per-card geometry/background/border-radius/shadow/`var()`-consumed custom-property writes.
- **Alternatives considered / rejected:** Counter-scaling `border-radius` via an inherited `--spatial-zoom` custom property (`?crad=1` probe).
- **Rejected because:** Measured on the real corpus — 3.9x UpdateLayoutTree (88.7→348.9ms, max single recalc 6.7→75.3ms), 2.4x Paint, 2.1x Layout, ~55% fewer engine frames (38→17), `frame:total` max 35.8→91.3ms. The probe was fully reverted.
- **Consequences:** Rounded corners scale with the card during zoom (correct for a rigid magnified surface). The one-frame radius snap at the fluid→screen flip is accepted and inseparable from the re-pack.
- **Enforcement:** documented comments in `useSpatialViewer.ts` (renderFrame), `dom-renderer.ts` (RenderMode + transform write), `globals.css` (.spatial-world .grid-item).
- **Do Not Reverse Without:** explicit user approval.

---

## D-02 — Spatial renderer is a pure engine / thin renderer split

- **Status:** ACCEPTED
- **Date:** current spatial work
- **Context:** Want a future LeaferJS/WebGL backend to replace the DOM renderer without touching the engine.
- **Decision:** `spatial-engine.ts` is pure (layout, camera, culling, LOD; no DOM/React). `dom-renderer.ts` consumes `VisibleItem[]` and diffs against mounted set. `useSpatialViewer.ts` owns the rAF loop.
- **Consequences:** Easy swap-in of a canvas backend; the renderer only speaks `VisibleItem[]`.

---

## D-03 — Temporally-continuous fluid zoom is the default camera path

- **Status:** ACCEPTED
- **Date:** current spatial work (commit `9381a30`)
- **Context:** Per-event instant-stamp zoom felt like discrete notches, not a magnifier.
- **Decision:** Wheel updates only `target.zoom`; the camera eases toward it each rAF with a short critically-damped response (`FLUID_ZOOM_TAU = 100ms`). Opt-out `?zinstant=1` preserves the old behavior for A/B.
- **Consequences:** Smooth continuous motion; settle must solve for `target.zoom` (the resting zoom), not the transient `camera.zoom`.
- **Related:** D-04.

---

## D-04 — Single post-gesture settle, endpoint-normalized, at the resting zoom

- **Status:** ACCEPTED
- **Date:** current spatial work (commits `293d043`, `a36736b`, `1bf6f2f`)
- **Context:** After a gesture, cards must re-pack to the optimal layout exactly once with no snap, no re-settling, no drift.
- **Decision:** After `SETTLE_IDLE_MS` idle, freeze geometry, solve for `target.zoom`, and ease via one critically-damped spring (`springSettle`) on a shared clock `solveT`. Endpoint normalization guarantees the final settle frame lands exactly on solved geometry. Momentum from the gesture's end camera velocity may seed the spring (bounded, monotonic).
- **Consequences:** Convergence is by proximity (settleMs ceiling), not epsilon. `done ⇔ solveT >= settleMs`.
- **Related:** D-05.

---

## D-05 — Reading-card pin holds through the post-settle zoom convergence tail

- **Status:** ACCEPTED
- **Date:** current spatial work (commit `1bf6f2f`)
- **Context:** Rows resizing during the settle would push the user's reading region up/down; and after the morph the camera still converges to `target.zoom`, shifting the just-settled layout (~3px/frame).
- **Decision:** Capture the reading card (at focus point `SETTLE_FOCUS_X=0.5`, `SETTLE_FOCUS_Y=0.4`) before the solve, then keep that card pinned to the focus point until the camera rests at `target.zoom` (`SETTLE_ANCHOR_ZOOM_EPS`). Release immediately if a programmatic retarget moves `target.zoom` away from `lastGridZ`.
- **Consequences:** Reading region stays fixed through morph + convergence tail.

---

## D-06 — Grid packing is continuous/analytic (zero per-frame allocation)

- **Status:** ACCEPTED
- **Date:** current spatial work
- **Context:** Thousands of cards must reflow live without GC pressure or jank.
- **Decision:** `computeGrid` packs rows via a cumulative aspect-flow whose boundary moves continuously with zoom; preallocated `Float64Array`/`layoutItems` buffers; justified row height with `MAX_CARD_FRACTION` cap.
- **Consequences:** Card geometry is a pure function of zoom; cheap re-solves during rest-state.

---

## D-07 — Local-first JSON-file storage (no database)

- **Status:** ACCEPTED
- **Context:** Single-user, local, read-only viewer.
- **Decision:** Store `bookmarks-data.json` / `folders-data.json` / `bookmarks.jsonl` on disk; read them directly.
- **Alternatives rejected:** SQLite/Postgres — overkill for a read-only viewer.
- **Do Not Change Without:** approval (format is consumed by both the app and the spatial prototype).

---

## D-08 — X auth is browser-derived (primary) with manual cookies (fallback)

- **Status:** ACCEPTED
- **Date:** early (see HISTORY)
- **Context:** The app needs authenticated X access to sync folders without requiring manual pasting.
- **Decision:** Field Theory auto-detects the local browser profile (`auto:firefox` etc.); Sync Settings lets the user switch to `manual` (paste `ct0` + `auth_token`) or pick a browser.
- **Alternatives rejected:** OAuth-only (insufficient for the automatic-discovery UX), manual-entry-only (poor UX).
- **Consequences:** Cookie material is security-sensitive (see SECURITY_MODEL). Local browser access required for `auto`.

---

## D-09 — X-facing jobs run as Node child processes (not in-process)

- **Status:** ACCEPTED
- **Context:** Field Theory CLI is a separate binary; running it in-process is risky.
- **Decision:** `server-jobs.ts` spawns Node processes (`ft sync/index/list`, `sync-folders.js`, `export-bookmarks.js`) with a 300s timeout, job lock, and cookie env injection.
- **Consequences:** No in-process crashes; status via `jobState` snapshot.

---

## D-10 — API guarded by localhost-or-API-key + rate limiting + security headers + sanitized errors + Zod

- **Status:** ACCEPTED
- **Date:** commit `7c94918` ("Secure app: proxy headers, rate limiting, Zod, sanitized errors")
- **Context:** API routes should be reachable only from localhost (or a keyed remote), must be rate-limited, and must not leak internals.
- **Decision:** `requireLocalOrApiKey()` (localhost/127.0.0.1/::1 pass; else require `x-api-key` matching `X_API_KEY`). `proxy.ts` enforces in-memory rate-limit tiers (strict/moderate/default) keyed by client IP, returns `429` + `Retry-After`/`X-RateLimit-*` headers, and sets security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, base CSP). `sanitizeError()` only surfaces whitelisted prefixes. `/api/cookies` POST is Zod-validated.
- **Consequences:** Safer to expose via tunnel for remote testing.

---

## D-11 — Feed engine contract: geometry cache is authoritative, DOM pool is disposable

- **Status:** ACCEPTED
- **Context:** The bookmark viewer must virtualize thousands of cards without React re-renders per frame.
- **Decision:** `engineRef.current.geometry` (Map of `GeometryState`) is authoritative; a fixed pool of `.grid-item` divs is mounted/moved/evicted per frame; `renderVisibleItems` only touches visible items; EPS-guarded writes.
- **Consequences:** Per-frame cost proportional to visible items; content re-render only on target size/view change.

---

## D-12 — In-app zoom is a density control (column count), not a magnifier

- **Status:** ACCEPTED
- **Context:** In the bookmark viewer, zoom shifts effective column count by one step (gliding transitions).
- **Decision:** `ZOOM_MIN..MAX = -3..+3`, bounded by column clamp (media 2–6, cards 1–5). Anchored reflow keeps the topmost visible card glued.
- **Consequences:** Distinct from the spatial prototype's magnifier zoom. Applies to media/card views only.

---

## D-13 — Drag-pan removed from spatial viewport; scroll = pan

- **Status:** ACCEPTED
- **Date:** current spatial work
- **Context:** The spatial surface is scroll-driven; left-click drag as pan was removed.
- **Decision:** Scroll/trackpad = pan; Ctrl+scroll = zoom; minimap jump for 2D navigation. Pointer is still tracked for cursor-anchored button zoom.
- **Consequences:** Cleaner interaction model; `.spatial-viewport` uses default cursor.

---

## D-14 — Kairos profiler is a permanent gated subsystem

- **Status:** ACCEPTED
- **Context:** Need reproducible performance data without shipping instrumentation cost.
- **Decision:** `lib/perf.ts` singleton `window.__kairosPerf`; disabled path is a single boolean check. Enable `?profile` / `Shift+P`.
- **Consequences:** Engineering policy: optimize only on profiler-identified hotspots; instrument new renderer subsystems via the profiler.

---

## D-15 — Sort picker component removed in favor of dialkit popover

- **Status:** ACCEPTED (historical)
- **Date:** commit `c17d62e`
- **Context:** UI consolidation.
- **Decision:** Removed dedicated sort-picker; sorting via the dialkit "More" popover + `SortConfig` (multi-rule).
- **Consequences:** Cleaner toolbar; `SortConfig` supports multi-rule sorts.

---

## D-16 — Snapshots `spatialv1/3/4` are git-ignored and excluded from type-check

- **Status:** ACCEPTED
- **Date:** current
- **Context:** Rollback snapshots of spatial code caused `next build` type-check failures (`dragging` property).
- **Decision:** Add `spatialv1`, `spatialv3`, `spatialv4` to `tsconfig.json` `exclude`.
- **Consequences:** `npm run build` passes; snapshots stay as un-tracked rollback references.

---

## D-17 — Remote-access dev-server security (allowedDevOrigins / tunnel notes)

- **Status:** ACCEPTED
- **Context:** Accessing the dev server from another laptop via tunnel triggers a Next.js dev-resource cross-origin warning.
- **Decision:** For dev-server tunneling, add the tunnel host to `allowedDevOrigins` in `next.config.ts`. For production, the API-key auth applies.
- **Consequences:** See README "Remote access" section.