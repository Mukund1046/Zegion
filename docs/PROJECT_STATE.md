# PROJECT_STATE.md

## Why does the project exist?

**Zegion** is a local-first browser for X (Twitter) bookmarks. It exists because X's own bookmark interface is a poor tool for large collections: no real search, no filtering by author/domain/category, no media-focused views, no density control. Zegion turns a user's own X bookmarks export into a fast, filterable, media-first reading application that runs entirely on the user's machine.

The repo also contains **Kairos**, the renderer engineering subsystem — including a gated frame-time profiler (`lib/perf.ts`) and a prototype **spatial renderer** (`lib/spatial/`) that explores compositor-only fluid zoom, continuous camera motion, and a canvas-style infinite zoom experience. The spatial renderer is a research prototype, not a shipped feature.

## What problem does it solve?

- Retrieving and organizing thousands of saved X bookmarks quickly (filter, search, sort).
- Reading media bookmarks in an image-first grid or a compact cards view.
- Browsing by author, category (LLM-classified), domain, linked site, folder, or media kind.
- Navigating a large timeline by date (scrubber) without endless scrolling.
- Multi-browser sync so multiple open browser tabs stay consistent.
- Exploring whether a "zooming surface" reading model is viable for the same bookmark corpus.

## Who is it for?

- The owner of an X account with a large saved-bookmarks collection who exports via **Field Theory** (`fieldtheory` npm CLI).
- A single-user, local-first workflow. Not multi-tenant, not cloud.

## What has been built?

See `ARCHITECTURE.md` for component detail. Summary:

- **Bookmark Viewer** (`/`) — the main application.
- **Spatial Renderer Prototype** (`/spatial`) — the research prototype.
- **Sync / Re-index server actions** — spawn Field Theory CLI + export scripts as child processes.
- **API layer** — bookmarks, status, sync, reindex, cookies config, protected by localhost-or-API-key auth.
- **Kairos profiler** — gated, zero-overhead-in-disabled-mode frame-time instrumentation.
- **Data export toolchain** — `lib/export-bookmarks.js` (JSONL → JSON, enriches with category/domain), `lib/sync-folders.js` (folder sync via X GraphQL).

## What is currently implemented?

### Bookmark Viewer (application)
- **Media view**: image-first masonry grid (2–6 columns responsive).
- **Cards view**: compact cards with author, handle, clipped text, timeline, like/repost/bookmark stats.
- **Search command palette** (`⌘K` / button): full-text over author/name/text/folders; prefix facets `@author`, `#category`, `domain:`, `!domain:`, `sites:`, `!sites:`; keyword highlighting; stable result ordering; keyboard navigation.
- **Facet filtering**: folder, category, domain, linked domain, site, author, media kind.
- **Sorting**: by bookmarked date, posted date, likes — each ascending/descending, multi-rule `SortConfig`.
- **Zoom density control** (−3..+3 steps, glide column transitions, anchored reflow).
- **Date scrubber** (media/cards views): right-edge rail with week markers, day anchors, hover preview card, click-to-jump, auto-hide on scroll.
- **Lightbox**: FLIP-animated open/close from the grid card, hi-res image swap, video/GIF play pill, responsive reframe on resize/visualViewport.
- **Context menu**: copy link / copy text / copy handle / open on X (dialkit-styled).
- **Dark/light mode** (persisted), theme transition.
- **State persistence** in `localStorage` (`kairos_state`) with storage guards for blocked-storage browsers.
- **Multi-tab sync** via `BroadcastChannel("kairos-sync")`.
- **Sync / Re-index buttons** in the overflow menu; status pill with thinking orb while busy.
- **Sync settings dialog**: cookie source `auto` (browser) vs `manual` (ct0 + auth_token), browser picker.
- **Scroll-to-top FAB**, auto-hiding feed bottom bar with view toggle / zoom controls.
- **Virtualized DOM pool rendering**: a fixed pool of `.grid-item` divs (260 low-spec / 420 normal) mounted, moved, evicted per frame; only visible items are in the DOM.
- **Critically-damped spring geometry transitions** for layout glides; retargets preserve position+velocity.
- **Pan/zoom canvas mode** in non-feed views (drag to pan, wheel to pan, ctrl+wheel to zoom, touch drag).
- **Responsive low-spec detection** (`deviceMemory`/`cores`/width) that shrinks pool/buffer and disables interpolation.
- **Kairos profiler**: `?profile` on load or `Shift+P`, HUD, `window.__kairosPerf.summary()`.

### Spatial Renderer Prototype (prototype)
- **Pure engine** (`lib/spatial/spatial-engine.ts`): renderer-agnostic — layout, camera, culling, LOD; no DOM/React.
- **Continuous analytic grid packing** (`computeGrid`): card geometry is a pure function of zoom; cumulative aspect-flow row packing, justified to viewport width; zero per-frame allocation.
- **Fluid zoom** (default): temporally-continuous magnifier. Wheel events only update `target.zoom`; the camera eases toward it each rAF with a short critically-damped response (`FLUID_ZOOM_TAU=100ms`). Discrete notches become one unbroken motion. A/B opt-out `?zinstant=1`.
- **Compositor-only zoom**: during a gesture the layout freezes as an inert surface and cards scale purely via per-card `transform` (`scale` mode) or a single world-container transform (`?wz=1`). No layout/re-raster during the gesture. (FLUID-ZOOM INVARIANT — see DECISIONS.md D-01.)
- **Post-gesture single settle**: after `SETTLE_IDLE_MS` idle, the layout re-solves to the optimal packing for the resting zoom and eases exactly once with an endpoint-normalized critically-damped spring (`springSettle`), seeded with bounded momentum inherited from the gesture's end camera velocity (live-tunable). Reading-card pin keeps the card under the user's focus point fixed through the morph and the camera's post-settle convergence tail.
- **World-anchored zoom**: the world point under the cursor stays pinned under the cursor for the whole gesture (`cameraForAnchor`).
- **LOD image buckets**: `small`/`medium`/`large` by zoom; upgrades deferred while a gesture is live; per-frame preload budget with `drainPending()` idle drain; shimmer-to-loaded transitions; ownership checks on async image load.
- **DOM pool renderer** (`lib/spatial/dom-renderer.ts`): mode-aware render contract (`screen`/`scale`/`world`), atomic geometry+transform rewrite on mode flip, diffed mounts/evictions, stale-alt-text prevention.
- **Culling + LOD**: screen-space cull with gesture-time widened window (magnifier overflow), `MIN_RENDER_HEIGHT` LOD floor.
- **Controls**: `−`/`+` step zoom (cursor-anchored), `Fit` (whole world at `zFit`), `1:1`, `Reset`; scroll/trackpad = pan; Ctrl+scroll = zoom; minimap with viewport box that jumps on click; live DialKit tuning panel for settle parameters (`?`-gated).
- **Live motion tuning** via DialKit sliders (`SETTLE_IDLE_MS`, `SETTLE_MS`, `FLUID_ZOOM_TAU`, `criticalSettleW`, momentum gain/clamp), persisted to `localStorage` (`kairos-spatial-settle`).
- **Gated instrumentation**: `?probe` exposes `window.__spatialProbe = { engine }` for external verification scripts.

## What is partially implemented?

- **Chrome/Edge/Brave folder sync**: `sync-folders.js` has code paths for all four browsers (`--browser`), but only Firefox is exercised/tested; folder sync is the fragile link (X API shape, cookies rotation) and is wrapped with a non-fatal warning in `syncBookmarks()`.
- **Card content in spatial prototype**: cards render text + image only (no stats/timeline/handle); the application cards view has the full body.
- **`?zsmooth=1` smooth law**: folded into the default fluid path; the query flag is no longer required (fluid is default now).

## What is intentionally not implemented?

- **No database**: JSON files on disk are the store (bookmarks-data.json, folders-data.json, bookmarks.jsonl). No SQLite/Postgres.
- **No auth UI in the browser**: cookies are either read from the local browser profile (Field Theory auto) or pasted into Sync Settings (manual). No OAuth flow in this app.
- **No editing/deleting bookmarks**: read-only viewer by design.
- **No server-side rendering of bookmark content**: the viewer is fully client-side; API serves static JSON.
- **No automated test suite** (see AGENTS.md).
- **No cloud sync / multi-user**: strictly local.

## What are the major subsystems?

1. **Next.js app shell** — routes, layout, API routes, proxy middleware.
2. **Bookmark Viewer engine** — `useBookmarkViewer.ts` (state, DOM pool, geometry transitions, scrubber, lightbox, gestures).
3. **Spatial renderer** — `useSpatialViewer.ts` + `spatial-engine.ts` + `dom-renderer.ts`.
4. **Data toolchain** — `export-bookmarks.js`, `sync-folders.js`, `config.js`, `native-config.ts`.
5. **Server job orchestration** — `server-jobs.ts` (spawned child processes, job lock, status snapshot).
6. **Security layer** — `api-auth.ts`, `rate-limit.ts`, `cookie-config.ts`.
7. **Kairos profiler** — `perf.ts`.
8. **Shared lib** — `bookmark-utils.ts`, `geometry.ts`, `icons.ts`, `client-api.ts`, `types.ts`.

## How do the subsystems interact?

- **UI → API**: the viewer fetches `/api/bookmarks` (full or `?fields=spatial`), polls `/api/status`, POSTs `/api/sync` / `/api/reindex` / `/api/cookies`.
- **API → Disk**: `server-jobs.ts` reads `data/output/*.json`; sync/reindex spawn Node child processes running Field Theory CLI and the export/folder scripts.
- **Child processes → Disk**: `ft sync` writes `bookmarks.jsonl`; `sync-folders.js` writes `folders-data.json`; `export-bookmarks.js` merges JSONL + Field Theory `list` (category/domain enrichment) into `bookmarks-data.json`.
- **Cookies → Child processes**: `syncBookmarks()` passes `X_CT0`/`X_AUTH_TOKEN` from `cookie-config.ts` into the spawned scripts' env.
- **Renderer ↔ Engine (spatial)**: the engine is pure and emits `VisibleItem[]`; `useSpatialViewer` owns the rAF loop and feeds the DOM renderer.

## What technologies are used?

- Next.js 16.2.11 (Turbopack), React 19.1, TypeScript 6.0.
- `motion` (Framer Motion), `thinking-orbs`, `dialkit`, `@hugeicons/react` + `@hugeicons/core-free-icons`, `radix-ui`/`@base-ui/react`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `zod`, `flubber`, `figma-squircle`, `fieldtheory` (external CLI), `react-use-measure`, `cmdk`, `lucide-react`, `shadcn`.
- Custom UI primitives in `components/ui/` (dialog, popover, context-menu, button, input, drawer, scroll-area, field, kbd, squircle-clip, error-boundary, bloom-menu) and `components/animate-ui/` (radix popover, highlight).
- `next/font/google` (Host Grotesk, Faculty Glyphic, DM Mono).
- Node child processes for all X-facing work (Field Theory CLI).

## What external services are involved?

- **X (Twitter)** GraphQL endpoints (used by `sync-folders.js` and Field Theory).
- **OpenAI Codex CLI** — used by Field Theory's LLM classification engine (`classify` / `classify-domains`). **Not** required to run the viewer; only for regenerating category/domain classification.
- No other external services. No telemetry, no cloud.

## What assumptions does the system make?

- Bookmarks come from Field Theory's JSONL format (`bookmarks.jsonl`) — field names like `id`, `text`, `url`, `author`, `images`, etc.
- The user's X session cookies (`X_CT0`, `X_AUTH_TOKEN`) are available either from the local browser profile (Field Theory auto) or pasted manually.
- Local filesystem is writable in `data/output/` (or `FT_DATA_DIR`).
- Single-user, single-machine usage.

## What constraints exist?

- X cookie authentication is fragile: `ct0`/`auth_token` rotate; folder sync can break silently. Handled as non-fatal warning.
- The Field Theory CLI must run via the Windows Codex launcher patch (see AGENTS.md) for classification.
- Large collections (thousands of bookmarks) must stay smooth in the browser: hence pool rendering, spring geometry, LOD, compositor-only zoom.
- `data/`, `.env`, generated JSON are git-ignored and must never be committed.

## What architectural decisions have already been made?

See `DECISIONS.md` for the full ADR-style log. Highlights:

- Local-first, JSON-file storage (no database).
- Browser-derived or manually-pasted X cookies (no OAuth flow).
- Client-side viewer with a virtualized DOM pool (no SSR of content).
- Node child-process orchestration for X-facing jobs (not in-process).
- Composition-only fluid zoom with frozen layout during gesture, single post-gesture settle (spatial).
- Pure engine / thin renderer split for the spatial prototype.
- API guarded by localhost-or-API-key + optional rate limiting + Zod validation + sanitized errors.

## What approaches were tried and rejected?

| Approach | Status | Reason |
|---|---|---|
| Counter-scaling `border-radius` during spatial zoom (`--spatial-zoom` custom property) | REJECTED | Measured: 3.9x UpdateLayoutTree, 2.4x Paint, ~55% fewer engine frames. Compositor-only invariant violated. |
| Per-event instant-stamp zoom (baseline) | SUPERSEDED | Replaced by temporally-continuous fluid zoom; kept as `?zinstant=1` A/B. |
| 2D canvas view as a shipped default | NOT SHIPPED | `canvas` mode existed in code history; the current shipped views are media/card. |
| OAuth-only authentication | REJECTED | Insufficient for the automatic-discovery UX; not built. |
| Manual cookie entry as the only auth | REJECTED (as sole path) | Kept as an option, but auto browser profile discovery is the primary path. |
| Sorting via a dedicated sort picker component | REMOVED | Superseded by dialkit popover UI + `SortConfig`. |
| Drag-pan in spatial viewport | REMOVED | Replaced by scroll/trackpad pan; drag is intentionally not a pan gesture in the scroll-driven feed. |

## What security considerations exist?

See `SECURITY_MODEL.md`. Key points: cookie secrets only ever reach spawned child processes via env (never logged), `.env`/`data` git-ignored, API auth for non-localhost callers, sanitized error messages, rate limiting scaffolding, Zod-validated config writes.

## What UX principles have been established?

See `UX_SPEC.md`. Highlights: media-first, information-dense, minimal chrome, buttery motion (springs/FLIP), everything keyboard-accessible where it matters, automatic (hover/scroll) UI reveal, persisted preferences, low-spec graceful degradation.

## What should never be changed without explicit approval?

- The **camera zoom law** and the fluid/settle architecture in the spatial engine.
- The **FLUID-ZOOM INVARIANT** (compositor-only zoom during gestures).
- The **feed engine contract** (pool rendering, geometry-as-authority, EPS guards).
- The **auth model** (browser-derived + manual cookies).
- **Storage format** (`bookmarks-data.json` shape consumed by the viewer + spatial).
- The **live-tuned settle defaults** baked into `spatial-engine.ts` module constants (they seed the DialKit defaults).
- Anything in the **golden baseline** — the endpoint-normalized settle and reading-card pin are considered correct behavior.

## What unresolved problems exist?

See `KNOWN_ISSUES.md` and `OPEN_QUESTIONS.md`. Notable: folder sync fragility, no automated tests, the one-frame radius snap at the fluid→screen flip (accepted design decision), large-collection initial load time, and whether the spatial prototype should become a real feature.