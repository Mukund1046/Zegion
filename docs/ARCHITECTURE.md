# ARCHITECTURE.md

Documentation of the actual implementation architecture.

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│ Next.js 16 App (Turbopack) — port 3001                   │
│  app/layout.tsx  app/page.tsx  app/spatial/page.tsx      │
│  app/api/*  proxy.ts (middleware)                        │
├─────────────────────────────────────────────────────────┤
│ CLIENT                                                  │
│  BookmarksViewer.tsx ─── useBookmarkViewer.ts            │
│  SpatialViewer.tsx   ─── useSpatialViewer.ts             │
│    └─ lib/spatial/spatial-engine.ts (pure)               │
│    └─ lib/spatial/dom-renderer.ts (DOM pool)             │
│  lib/geometry.ts  lib/bookmark-utils.ts  lib/perf.ts     │
│  components/ui/*  components/animate-ui/*                │
├─────────────────────────────────────────────────────────┤
│ SERVER (API routes + server-jobs)                        │
│  server-jobs.ts (spawns child processes, job lock)       │
│  api-auth.ts  rate-limit.ts  cookie-config.ts            │
│  native-config.ts (env/path resolution for Next runtime) │
├─────────────────────────────────────────────────────────┤
│ CHILD PROCESSES (Node)                                  │
│  node_modules/fieldtheory/bin/ft.mjs (sync/index/list)   │
│  lib/sync-folders.js  lib/export-bookmarks.js            │
│  config.js (env/path resolution for the scripts)         │
├─────────────────────────────────────────────────────────┤
│ DISK                                                    │
│  data/bookmarks/bookmarks.jsonl   (Field Theory raw)     │
│  data/output/bookmarks-data.json (viewer JSON)           │
│  data/output/folders-data.json    (folder names)         │
│  cookies-config.json (cookie source config)              │
│  bookmarks-meta.json (last run times)                    │
│  .env (X_CT0, X_AUTH_TOKEN, X_API_KEY, paths)            │
└─────────────────────────────────────────────────────────┘
```

---

## Frontend

### Component: Bookmark Viewer page
- **Purpose:** main application; browse/filter/sort/search X bookmarks.
- **Location:** `app/page.tsx` → `components/BookmarksViewer.tsx` → `hooks/useBookmarkViewer.ts`.
- **Inputs:** `GET /api/bookmarks` JSON, user gestures/keys.
- **Outputs:** rendered DOM pool, lightbox, scrubber, context menu.
- **Dependencies:** `lib/bookmark-utils.ts`, `lib/geometry.ts`, `lib/perf.ts`, `lib/client-api.ts`, `components/ui/*`.
- **Consumers:** the browser user.
- **Failure modes:** empty/garbled JSON → empty feed + console error; storage blocked → state not persisted (guarded).
- **Security considerations:** renders only local JSON; X URLs open in new tab with `noopener`.
- **Current status:** stable; actively maintained.

### Component: Spatial viewer page (prototype)
- **Purpose:** research prototype exploring compositor-only fluid zoom + continuous camera motion.
- **Location:** `app/spatial/page.tsx` → `components/spatial/SpatialViewer.tsx` → `hooks/useSpatialViewer.ts` → `lib/spatial/*`.
- **Inputs:** `GET /api/bookmarks?fields=spatial`, wheel/pointer/touch.
- **Outputs:** `.spatial-world` grid of pooled cards, minimap.
- **Dependencies:** `lib/spatial/spatial-engine.ts` (pure), `lib/spatial/dom-renderer.ts`, `lib/perf.ts`, `lib/bookmark-utils.ts`.
- **Consumers:** the prototype tester; future renderers (LeaferJS/WebGL noted as swap-in targets).
- **Failure modes:** engine is pure so bugs are deterministic; DOM pool exhaustion degrades to deferred preload.
- **Security considerations:** none beyond the shared API auth.
- **Current status:** prototype; not a shipped feature.

---

## Backend

### Component: Server job orchestration
- **Purpose:** run sync/reindex as guarded child processes and expose status.
- **Location:** `lib/server-jobs.ts`.
- **Inputs:** `/api/sync` POST, `/api/reindex` POST, `/api/status` GET.
- **Outputs:** status snapshots; writes JSON to `data/output/`.
- **Dependencies:** `native-config.ts`, `cookie-config.ts`, `config.js` (scripts side).
- **Consumers:** the viewer UI, external API-key callers.
- **Failure modes:** job lock (409 if already running), script timeout (SIGTERM at 300s), folder-sync non-fatal warning.
- **Security considerations:** never logs cookie material; only passes via child env.
- **Current status:** stable.

### Component: Proxy middleware
- **Purpose:** rate limiting + security headers for all routes, applied before API handlers.
- **Location:** `proxy.ts` (middleware).
- **Inputs/Outputs:** requests/responses; returns `429` with `Retry-After` + `X-RateLimit-*` headers when a tier is exceeded.
- **Details:** tiers — `strict` (5/min) for `/api/cookies`, `moderate` (30/min) for `/api/sync`/`/api/reindex`, `default` (60/min) elsewhere, keyed by client IP. Sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and a base CSP on API routes.
- **Current status:** active.

---

## Data layer

### Component: JSON file storage
- **Purpose:** the store.
- **Location:** `data/output/bookmarks-data.json`, `data/output/folders-data.json`, `data/bookmarks/bookmarks.jsonl`, `cookies-config.json`, `bookmarks-meta.json`.
- **Inputs:** spawned scripts.
- **Outputs:** API JSON.
- **Failure modes:** missing/corrupt files → empty arrays (graceful).
- **Current status:** stable; no migration needed (format is versioned by code, not schema).

---

## Authentication

### Component: Cookie config + API auth
- **Purpose:** choose cookie source (`auto` browser vs `manual` pasted) and guard API routes.
- **Location:** `lib/cookie-config.ts`, `lib/api-auth.ts`.
- **Inputs:** `GET/POST /api/cookies`, request headers.
- **Outputs:** cookie mode string (`auto:firefox`, `manual-runtime`, etc.); auth verdict.
- **Dependencies:** `native-config.ts` (JSONL dir).
- **Consumers:** `server-jobs.ts`, all API routes.
- **Failure modes:** missing cookies → `manual-incomplete`/`missing` mode; API 401 for non-localhost without key.
- **Security considerations:** see SECURITY_MODEL.
- **Current status:** stable.

---

## API layer

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/bookmarks` | GET | full JSON or `?fields=spatial` slim payload | localhost-or-key |
| `/api/status` | GET | job/count/cookie status snapshot | localhost-or-key |
| `/api/sync` | POST | full sync (ft sync + folders + export) | localhost-or-key |
| `/api/reindex` | POST | re-index cache (ft index + export) | localhost-or-key |
| `/api/cookies` | GET/POST | read/write cookie config (Zod validated) | localhost-or-key |

All routes `dynamic = "force-dynamic"`; sync/reindex `maxDuration = 300`.

---

## External services

See `INTEGRATIONS.md`.

---

## Storage

- **JSONL:** `data/bookmarks/bookmarks.jsonl` (or `FT_DATA_DIR`) — Field Theory's raw export.
- **JSON:** `data/output/bookmarks-data.json` — merged + enriched (category/domain/linked domains/folders).
- **JSON:** `data/output/folders-data.json` — folder names.
- **JSON:** `cookies-config.json` — cookie source configuration (next to JSONL).
- **JSON:** `bookmarks-meta.json` — last run timestamps.
- **localStorage:** `kairos_state` (viewer prefs), `kairos-spatial-settle` (DialKit tune values).

---

## State management

- **Client:** React `useState` for UI state; a `useRef`-held mutable **engine object** (`engineRef.current`) for per-frame renderer state (pool, geometry, camera). This split is deliberate: per-frame data never triggers React re-renders.
- **Server:** in-memory `jobState` in `server-jobs.ts` (single process).
- **Cross-tab:** `BroadcastChannel("kairos-sync")`.

---

## Background processes

- `ft sync` / `ft index` / `ft list` (Field Theory CLI).
- `sync-folders.js` (X GraphQL folder sync).
- `export-bookmarks.js` (JSONL → enriched JSON).
- All spawned by `server-jobs.ts` with 300s timeout and job lock.

---

## Build system

- Next.js 16.2.11 with Turbopack.
- `npm run dev` → port 3001; `npm run build` → optimized production build; `npm start` → production.
- `npm run lint` = `tsc --noEmit`.
- `tsconfig.json` excludes `node_modules`, `spatialv1`, `spatialv3`, `spatialv4` (git-ignored snapshot dirs).

---

## Deployment

- Local single-machine. No CI/CD, no cloud deployment.
- Remote access for testing: Cloudflare Tunnel / ngrok / Tailscale (see README).
- For non-localhost access set `X_API_KEY` and call with `x-api-key` header, or keep it LAN-only.

---

## Error handling

- API routes catch and return `{ error: sanitizeError(...) }` (only known-safe prefixes leak).
- Job failures set `jobState.lastError` and return 500; folder sync failure is non-fatal.
- Client `reloadBookmarks()`/`runServerAction()` catch and surface tone in the status pill.
- Corrupt/missing JSON degrades to empty arrays.
- `ErrorBoundary` wraps the main viewer.

---

## Logging

- No formal logging framework. `console.warn/error` for failures; Kairos profiler for performance spans; spawned scripts print to stdout/stderr captured into error messages.

---

## Testing

- No automated test suite configured (see AGENTS.md).
- Validation is manual: browser checks across Media/Cards views, lightbox, folder filtering, data-script regeneration.
- The spatial prototype has been validated with external `.mjs` trace/verification harnesses (postsettle-drift-trace.mjs, settle-motion-trace.mjs, spatial-settle-trace.mjs, spatial-settle-jitter-trace.mjs, spatial-motion-trace.mjs, probe-flip-consistency.mjs, spatial-measure-churn.mjs) run against `?probe=1`.

---

## Kairos Profiler (perf subsystem)

- **Location:** `lib/perf.ts`.
- **Activation:** `?profile` or `Shift+P`.
- **Surface:** HUD + `window.__kairosPerf.summary()` returning `{ spans, frames, counters }`.
- **Instrumented spans:** layout, retarget, filter:compute, rebuild:total, zoom:rebuild, rebuild:viewportMode, rebuild:scrubber, rebuild:state, rebuild:transition, rebuild:render, render:pool, render:evict, content:image, content:body, tick:spring, render:visible, camera:tick, cull:visible, grid:solve, settle:morph, frame:render, frame:total.
- **Policy:** optimize only on reproducible profiler hotspots; new renderer subsystems must be instrumented via the profiler, not separate tooling.
