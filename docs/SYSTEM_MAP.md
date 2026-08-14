# SYSTEM_MAP.md

## Graph

```
USER
 │
 ▼
BOOKMARK VIEWER (/)
 │  useBookmarkViewer.ts  BookmarksViewer.tsx
 │
 ├── Filters ── Search palette ── SortConfig
 ├── Feed engine (DOM pool, geometry springs, scrubber)
 ├── Lightbox (FLIP, hi-res, video pill)
 ├── Context menu ── copy/open
 ├── Sync status ── /api/status
 └── Sync / Re-index ── /api/sync, /api/reindex ── server-jobs.ts
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              ft sync/index       sync-folders.js     export-bookmarks.js
              (Field Theory)      (X GraphQL)         (JSONL→JSON enrich)
                    │                   │                   │
                    ▼                   ▼                   ▼
              bookmarks.jsonl     folders-data.json   bookmarks-data.json
                                        │
                                        ▼
                                   cookies-config.json (env X_CT0 / X_AUTH_TOKEN)

SPATIAL PROTOTYPE (/spatial)
 │  useSpatialViewer.ts  SpatialViewer.tsx
 │
 ├── spatial-engine.ts (pure: grid, camera, cull, LOD, settle)
 │     │  emits VisibleItem[]
 │     ▼
 ├── dom-renderer.ts (DOM pool; screen/scale/world modes)
 ├── minimap (world + viewport box)
 └── /api/bookmarks?fields=spatial ── readBookmarksData()
```

## Node descriptions

| Node | What it is |
|---|---|
| `USER` | Single user, local browser. |
| `BOOKMARK VIEWER` | The main app (`/`). Client-side viewer + API calls. |
| `Feed engine` | `useBookmarkViewer.ts` core: layout, DOM pool, geometry springs, scrubber, gestures. |
| `Lightbox` | FLIP-animated media viewer. |
| `Search palette` | Command-style search with prefix facets. |
| `SYNC/REINDEX` | Server actions spawning child processes. |
| `server-jobs.ts` | Orchestration + job lock + status snapshot. |
| `ft sync/index` | Field Theory CLI (raw X sync / index). |
| `sync-folders.js` | X GraphQL folder sync (uses cookies). |
| `export-bookmarks.js` | Merge + enrich into viewer JSON. |
| `SPATIAL PROTOTYPE` | `/spatial` — research renderer. |
| `spatial-engine.ts` | Pure engine. |
| `dom-renderer.ts` | DOM pool renderer. |
| `minimap` | Overview + viewport box + click-to-jump. |
| `API` | `/api/bookmarks`, `/api/status`, `/api/sync`, `/api/reindex`, `/api/cookies`. |
| `DISK` | JSONL + JSON stores + cookie config. |

## Data flows

### Sync flow (server)
1. UI POST `/api/sync`.
2. `syncBookmarks()` reads `cookie-config.ts`.
3. Spawn `ft sync --browser <browser>` (or cookie overrides), then `sync-folders.js` (non-fatal), then `export-bookmarks.js`.
4. Each writes its JSON/JSONL artifact.
5. Returns fresh `readStatusSnapshot()`.

### Re-index flow
1. UI POST `/api/reindex`.
2. `reindexBookmarks()` runs `ft index` then `export-bookmarks.js`.
3. Returns snapshot.

### Viewer load flow
1. `useBookmarkViewer` reads `localStorage("kairos_state")`.
2. GET `/api/bookmarks` → JSON.
3. Filter → `setDisplayBookmarks` → pool + rebuild → render.

### Spatial load flow
1. `useSpatialViewer` creates engine + renderer pool.
2. GET `/api/bookmarks?fields=spatial` (slim payload).
3. `loadEngineBookmarks` → `computeGrid` → render + rAF loop.

### Status polling
- UI calls `loadServerStatus()` after init → `GET /api/status` → status pill.
- `BroadcastChannel("kairos-sync")` refreshes all open tabs after a sync.

## Important interaction invariants

- The **feed engine contract**: `geometry` cache authoritative; DOM pool disposable; EPS-guarded writes; only visible items touched per frame.
- The **FLUID-ZOOM INVARIANT**: during spatial `scale` mode only the card `transform` changes per frame.
- **Job lock**: only one sync/reindex at a time (409 otherwise).
- **API auth**: non-localhost callers require `x-api-key` = `X_API_KEY`.