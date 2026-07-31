# Zegion — Spatial Motion Rework: Precise Change Map

**Status**: Mapping (pre-implementation). **Scope**: render-layer only. Pipeline, masonry, search, lightbox, context menu, scrubber untouched.
**Target files**: `hooks/useBookmarkViewer.ts` (2,014 ln) — the only file with substantive edits. `lib/bookmark-utils.ts` and `components/BookmarksViewer.tsx` — **zero changes**. New: `lib/geometry.ts`.

---

## 1. The pipeline as-is (line anchors)

```
/api/bookmarks (data)
  ↓
init effect (useBookmarkViewer.ts:1377) → setAllBookmarks
  ↓
getFilteredBookmarks (lib/bookmark-utils.ts:244)  [folder → text → facet → multi-rule sort → media-only]
  ↓
refreshDisplay (hook:851) → resetViewportAndRebuild (hook:765)
  ↓
buildMasonryLayout (bookmark-utils:340)  [deterministic shortest-column; LayoutItem{key,bookmark,x,y,w,h}]
  ↓
engine.layoutItems (hook:188-232 engineRef)
  ↓
renderVisibleItems (hook:341)  [virtualization + pool assign; activeMap keyed by "col-row"]
  ↓
Imperative DOM: translate3d + w/h + renderCardContent (hook:268)
```

Every rebuild today **flushes** `activeMap` (all pooled nodes → freePool) and re-positions instantly (`resetViewportAndRebuild:772-776`). Feed mode has **no rAF loop** — renders on scroll events only (`syncFeedScrollState:1511-1525`, `requestRender:415`). Pan mode has a permanent eased rAF loop (`animateLoop:1704-1716`).

---

## 2. New architecture (target)

```
getFilteredBookmarks() → buildMasonryLayout() → [TARGET snapshot]
                                                    ↓
            Geometry Cache (bookmark.id → {prev, target, current, start, duration, done})
                                                    ↓
                 Motion/interpolation stage (per-frame, visible set only)
                                                    ↓
                 renderVisibleItems() consumes interpolated (x,y,w,h)
                                                    ↓
                 DOM: translate3d only; w/h settle at completion
```

**Identity rule**: motion state belongs to **bookmark.id**, never `.grid-item`. Pooled nodes are disposable surfaces. Node recycling inherits the bookmark's cached interpolated geometry.

---

## 3. Change map — `hooks/useBookmarkViewer.ts`

### 3.1 New module-level code — insert before line 130 (`export function useBookmarkViewer`)
- `interface Rect { x:number; y:number; w:number; h:number }`
- `interface GeometryState { prev:Rect; target:Rect; current:Rect; start:number; duration:number; done:boolean }` (extend later with `velocity` if spring)
- `const INTERPOLATE_DURATION = 360` and reuse the existing lightbox ease `[0.22,1,0.36,1]` (or `EASE_OUT` / `SPRING_LAYOUT` from `lib/ease.ts` — decision point D1).
- Pure `interpolateRect(prev, target, t, ease)` helper.
- **Diff ≈ 60-90 lines, additive, no risk to existing behavior.**

### 3.2 `engineRef` (188-232) — add fields
- `geometry: Map<string, GeometryState>` (authoritative positioning source)
- `transitionRaf: number | null` (feed-mode interpolation ticker handle)
- `animating: boolean`
- `config`: add `INTERPOLATE: boolean` (= `!isLowSpecDevice()`), `TRANSITION_DURATION`
- **Diff ≈ 6 lines.**

### 3.3 `renderVisibleItems` (341-413) — **core refactor**
- Key `activeMap` by `item.bookmark.id` (stable) instead of `item.key` ("col-row").
- Read interpolated geometry each frame: `g = geometry.get(id)` → compute `current`; missing cache → fall back to target (instant, first-paint).
- New pool assignment: set `translate3d(current.x, current.y)` and **current** w/h; then `renderCardContent` (content swap is instant while card glides — masks nothing, just reuses existing behavior).
- Existing entries: update `translate3d` only (skip w/h until `g.done`, then write target w/h once).
- Virtualization/visibility logic (buffer checks, freePool recycling, `elToBookmark` WeakMap) **unchanged**.
- **Diff ≈ 40-60 lines rewritten.**

### 3.4 `resetViewportAndRebuild` (765-813) — **identity/rebuild change**
- **Stop flushing pooled nodes** (delete lines 772-776). Keep `activeMap` intact.
- After `buildMasonryLayout`: for each `layoutItem`, seed geometry — `prev` = existing cache's `current` (else new rect), `target` = new rect, `start = now`, `done = false`. Bookmarks filtered out simply drop from `layoutItems` (their cache is inert; recycled later).
- Set `animating = true`; start transition ticker (3.9).
- Add `animate?: boolean` param — when `false`, seed with `prev = target` (instant = today's behavior). Low-spec forces `false`.
- Keep scroll-top, `updateViewportMode` (727-763), `buildScrubberData` (425-552) as-is.
- **Diff ≈ 30-45 lines.**

### 3.5 `refreshDisplay` (851-885) — passthrough
- Add `animate?: boolean`, forward to `resetViewportAndRebuild`. Note today's `instant` param is a dead no-op branch; repurpose it. **Diff ≈ 6 lines.**

### 3.6 Call sites — animate vs instant matrix
| Call site | Line | Mode |
|---|---|---|
| `applyFilter` (folder) | 1287-1312 | animate |
| `applyView` (media↔card) | 1314-1339 | animate* (D2) |
| `applyFacet` (@/#/domain/sites) | 1341-1367 | animate |
| `resetFilters` action | 1967-1982 | animate |
| `setActiveSearch` / `clearSearch` | 1942-1966 | **instant** |
| `reloadBookmarks` (post-sync) | 1212-1236 | instant (D3) |
| `onWindowResize` | 1622-1650 | animate (headline case) |
| `rebuildFeedForCurrentViewport` | 887-934 | animate |
| init first-paint | 1377-1487 | instant |

**Diff ≈ 10 small flag changes.**

### 3.7 NEW — transition ticker (the missing feed-mode loop)
- `startTransition()`: sets `animating=true`, launches rAF; each frame advances all **visible** geometry entries (`activeMap` membership gates it → cost ∝ visible items), calls `renderVisibleItems()`; when all `done`, stops rAF and sets `animating=false`.
- Pan mode: fold geometry advance into the existing `animateLoop` (1704-1716) so camera + interpolation compose in world coords before camera transform.
- Cleanup: cancel `transitionRaf` in the existing effect teardown (1735-1753).
- **Diff ≈ 40-60 lines, new.**

### 3.8 Unchanged (verify only)
- `renderCardContent` (268-339), `createPool` (815-849), `requestRender` (415-423), `updateViewportMode` (727-763), lightbox open/frame/close (936-1210), all scrubber fns (556-725, 1843-1880), effects 1369-1375, 1490-1501, 1775-1787, 1789-1827, return object (1886-2013).

---

## 4. New file — `lib/geometry.ts`
`Rect`, `GeometryState`, `interpolateRect`, easing constants (re-export from `lib/ease.ts`). ~40 lines. Pure functions, unit-testable by eye.

---

## 5. The 4 hard caveats (anchored)
1. **Feed mode has no rAF loop today** → 3.7 is new, and must **stop when idle** (zero idle cost).
2. **Scroll/container height jumps instantly** — `updateViewportMode:742-748` sets `height = maxColHeight` immediately; scrollbar length + scrubber anchors reflect target during transition. Accepted seam.
3. **Interrupted transitions** — re-base rule: on rebuild, `prev` = current *interpolated* position, never the original start, or cards jump backward.
4. **Re-keying activeMap** — `buildScrubberData` already maps by `bookmark.id` (`layoutMap`, 476-479), so no scrubber change needed. Any code reading `item.key` must switch to id (only renderVisibleItems does).

---

## 6. Performance guardrails (non-negotiable)
- Interpolation executes **only** for `activeMap`/visible+buffer items; offscreen bookmarks hold cached geometry only.
- Ticker idle-stops in feed mode.
- GPU-only during motion: `translate3d`/`scale`/`opacity`. **No** per-frame `width`/`height`/`top`/`left`. w/h settle at completion.
- No per-frame `getBoundingClientRect` (only lightbox/scrubber already).
- `config.INTERPOLATE=false` (low-spec) → every path degenerates to today's exact behavior.

---

## 7. Verification checklist
- Media + Cards: folder/facet/view switch glides, no image flash on recycle.
- Rapid search typing stays instant.
- Drag window resize: cards glide to new columns; scrollbar jump acceptable.
- Drag-pan mode: geometry composes with camera (no double-motion).
- Lightbox open → close → relayout path (1137-1210).
- Scrubber anchors land on correct target positions after transitions.
- Low-spec path = current behavior bit-for-bit.
- Frame-time compare vs. baseline; confirm no rAF while idle in feed mode.

---

## 8. Decision points (need your call)
- **D1**: Tween (`[0.22,1,0.36,1]`, ~360ms) vs spring (`SPRING_LAYOUT`). Recommend tween first; springs later if feel demands.
- **D2**: Media↔card view toggle — heights change drastically; morph can look odd. Recommend **instant** for view toggle, animate everything else.
- **D3**: Post-sync `reloadBookmarks` — recommend instant (avoid moving cards mid-sync-status).
- **D4**: Animate during text-search keystrokes — recommend **no** (chaos), as scoped.

---

## 9. Risk register
| Risk | Mitigation |
|---|---|
| Re-base bug on interrupted transitions | 3.4 seed rule; visual test rapid facet/typing interleave |
| Ticker leak | cancel in teardown 1735-1753; also on `resetViewportAndRebuild` |
| w/h settle timing vs scrollHeight jump | accept seam; settle w/h exactly at `done` |
| Content-swap flash on recycle mid-morph | content is written instantly at assignment (existing `renderCardContent`); masked by motion |
| Low-spec regression | `INTERPOLATE=false` full fallback |

---

**Bottom line**: ~200-250 net new/edited lines, all in `useBookmarkViewer.ts` + a new ~40-line `lib/geometry.ts`. `bookmark-utils.ts` and `BookmarksViewer.tsx` untouched. Performance profile preserved if the guardrails in §6 hold.
