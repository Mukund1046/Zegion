# DOMAIN_MODEL.md

## Entity: Bookmark

**Fields** (`lib/types.ts`):
- `id: string` — X tweet id.
- `text: string` — tweet body.
- `url: string` — canonical URL.
- `authorHandle: string`, `authorName: string`, `authorAvatar: string`.
- `postedAt`, `bookmarkedAt`, `syncedAt: string` (ISO).
- `images: BookmarkImage[]` (`{ url, width, height, type, videoUrl? }`).
- `mediaCount`, `likeCount`, `repostCount`, `bookmarkCount: number`.
- `category: string`, `categories: string[]` (Field Theory LLM classification).
- `domain: string | null`, `domains: string[]` (classified primary/external domain).
- `linkedDomains: string[]` (hosts found in embedded links).
- `folders: string[]` (X bookmark folders).

**Derived** (in `bookmark-utils.ts`):
- `getBookmarkMediaKind` → `Image` / `Video` / `GIF` / `Text`.
- `getBookmarkDomain`, `getBookmarkSite`, `getBookmarkCategory`, `getBookmarkAuthorsLabel`.
- `getTimelineEntries` → Posted/Saved/Synced rows.
- `twitterImageUrl(url, size)` → X CDN variant URL (`?format=jpg&name=<size>`).

**Lifecycle:** `ft sync`/JSONL → `export-bookmarks.js` merge+enrich → `bookmarks-data.json` → viewer `Bookmark[]`.

## Entity: BookmarkFolder

- `name: string`, optional `id`.
- Comes from `folders-data.json`; matched against `Bookmark.folders[]`.

## Entity: LayoutItem

- `{ key, bookmark, x, y, w, h }` — a placed card in the feed. Produced by `buildMasonryLayout` / `buildSpatialLayout`.

## Entity: GeometryState

- `{ prev, target, current, velocity, start, duration, done }` (see `lib/geometry.ts`).
- The authoritative per-card motion state in the feed; advanced by a critically-damped spring.

## Entity: GridItem / VisibleItem (spatial)

- `GridItem` — world-space `{ bookmarkId, x, y, w, h }`.
- `VisibleItem` — screen-space `{ bookmarkId, x, y, w, h, bucket: ImageSize }` emitted by culling.

## Entity: Camera (spatial)

- `{ x, y, zoom }` world position + magnification. `target` is the eased-to destination.

## Entity: SpatialEngine

- Pure engine state: bookmarks, viewport, world dims, zoom bounds, camera/target, preallocated grid buffers, layoutItems, fluid/settle state, live-tunable `tune` params.

## Entity: ZoomAnchor

- World point under the cursor captured at gesture start; `cameraForAnchor` keeps it pinned during the gesture.

## Domain concepts

- **Facet** — a filter axis: folder, category, domain, linked domain, site, author, media.
- **SortConfig** — ordered multi-rule sort (`{field, direction}[]`); fields: `bookmarkedAt`, `postedAt`, `likeCount`.
- **RenderMode** — `screen` (camera baked into geometry), `scale` (compositor transform only), `world` (one container transform, `?wz=1`).
- **Settle** — the single post-gesture re-pack morph to optimal packing.
- **Reading anchor** — the card pinned under the user's focus during settle + camera convergence.
- **Image bucket (LOD)** — `small`/`medium`/`large` chosen by zoom.

## Relationships

- Bookmark → Folder (many-to-many, via `folders[]`).
- Bookmark → Image (one primary via `images[0]`, many total).
- Bookmark → Category/Domain (many-to-one classified, many via `categories[]`/`domains[]`).
- Bookmark → LinkedDomain (many-to-many via `linkedDomains[]`).
- Bookmark → LayoutItem → GeometryState (1:1 when visible).
- SpatialEngine → GridItem (N preallocated) → VisibleItem (subset each frame).