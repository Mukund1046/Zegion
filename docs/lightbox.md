# Lightbox — Archived Working Idea (for future reuse)

> **Status:** Removed from main feed (`/`) in favor of Ripple Zoom / Spatial Focus. Preserved here verbatim for future reuse (e.g., standalone viewer, `?noripple` fallback, or masonry lightbox variant).

## Concept
A `FLIP` (First-Last-Invert-Play) clone that expands the clicked `grid-item` from its exact screen rect to a centered presentation, with a blurred backdrop and a caption bar. The original `grid-item` is hidden (`visibility: hidden`) while the clone (`position: fixed; z-index: 40001`) animates.

## Trigger Path (as implemented in `hooks/useBookmarkViewer.ts:1187`)
- **Owner:** `useBookmarkViewer` — single source of `lightboxOpen`, `lightboxAnimating`, `lightboxItem: {element, bookmark}`, `lightboxClone`.
- **Callers (all converge on `openLightbox(element: HTMLDivElement, bookmark: Bookmark)`):**
  - `onMouseUp` (`useBookmarkViewer.ts:1940`) — non-drag click on `.grid-item`.
  - `onViewportClick` (`useBookmarkViewer.ts:1950`) — `isVerticalFeedView(view)` path.
  - `onViewportKeyDown` (`useBookmarkViewer.ts:2072`) — `Enter`/`Space` on focused `.grid-item`.
  - `useSpatialFeed.ts:525` `handleCardEvent` — `SpatialFeed` at `/` forwards `onOpenLightbox(cardEl, bookmark)` via `bookmarkForElement` hit-test.
  - Fallback: if `bookmark.images` empty → `window.open(bookmark.url, "_blank")`.

## Animation
- **Target frame:** `getLightboxTargetFrame(media, vw, vh)` (`useBookmarkViewer.ts:107`) — `margin` 12/18/48, `captionReserve` 64/86/108, `maxWidth/Height` preserving `aspect`, centered `x/y`, `infoTop` for caption. Recomputed on `resize`/`visualViewport resize` via `updateOpenLightboxFrame`.
- **Clone setup:** `element.cloneNode(true)`, `querySelector(".grid-item-body")?.remove()`, `classList.add("lightbox-active")` (`position:fixed; top:0; left:0; z-index:40001; will-change:transform; transform-origin:top left; background:#0f0f10`), `width/height` set to `targetWidth/Height`, `transform: translate3d(startX,startY,0) scale(sx,sy)` where `sx = targetWidth/startWidth`.
- **Hi-res swap:** `new Image()` with `twitterImageUrl(url, "4096x4096")` appended to clone, `opacity 0→1` on load. `video`/`animated_gif` → `.lightbox-play-btn` with `play-pill` that opens `videoUrl`.
- **Overlay:** `lightboxOverlayRef` (`div.lightbox-overlay` `fixed inset:0 z40000 rgba(24,18,15,0.28) backdrop-filter:blur(10px)`) → `classList.add("active")` (`opacity 0→1`, `visibility hidden→visible`), `info` `translateY 8→0` delay `0.25s`, close button `scale 0.86→1` delay `0.2s`.
- **Motion:** `motion.animate(clone, {transform: [startTransform, endTransform]}, {duration:0.36, ease:[0.22,1,0.36,1]})`, `closeLightbox` reverses `0.3s`, `updateOpenLightboxFrame` resizes `0.18s`. `engine.lightboxAnimating` guards re-entry.

## State & Guards
- `engine.lightboxOpen`, `engine.lightboxAnimating`, `engine.lightboxItem`, `engine.lightboxClone`, `engine.needsPostLightboxRelayout`.
- `renderVisibleItems` skips eviction for `lightboxElement`: `if(entry.poolEl !== lightboxElement)`.
- `closeLightbox` → `overlay.remove("active")`, `setLightboxOpen(false)`, FLIP reverse, `clone.remove()`, `element.style.visibility=""`, `document.body.style.overflow=""`, `needsPostLightboxRelayout` triggers `rebuildFeedForCurrentViewport()`.

## UI (`components/BookmarksViewer.tsx:572` `LightboxOverlay`, `app/globals.css:1177`)
- `lightbox-overlay` backdrop, `lightbox-close` circular button `48px` with `X` svg, `lightbox-info` centered `min(640px, calc(100vw-48px))` with `lightbox-title` (2-line clamp), `lightbox-link` (`@handle`), `lightbox-meta` (`timeline`), `play-pill` for video.

## Reuse Notes
- To re-enable: restore `openLightbox`/`closeLightbox`/`updateOpenLightboxFrame` in `useBookmarkViewer`, `LightboxOverlay` in `BookmarksViewer`, `lightbox` guards in `renderVisibleItems` and `onWindowResize`, and `SpatialFeed` `onOpenLightbox` passthrough. Gate with `?lightbox` or `NEXT_PUBLIC_LIGHTBOX=1` similar to `isRippleEnabled`.
- Keep `FLIP` + `backdrop-filter` and `body overflow:hidden` for modal feel, vs Ripple’s `white` takeover + `translate`/`opacity` push.
