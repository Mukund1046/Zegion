# 003 — Replace array.find() loops with Map lookup

- **Status**: TODO
- **Commit**: b7fc021
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: react-doctor/js-index-maps
- **Estimated scope**: 1 file, ~10 lines changed

## Problem

At `hooks/useBookmarkViewer.ts:525,551`:

```tsx
// Line 525 inside a loop over weeks:
const firstItem = engine.layoutItems.find((li) => li.bookmark.id === firstBookmark.id);

// Line 551 inside a loop over sorted bookmarks:
const item = engine.layoutItems.find((li) => li.bookmark.id === bm.id);
```

Both `array.find()` calls run inside loops inside `buildScrubberData`. With ~52 weeks and ~420 layout items, the first call runs O(n*m) ≈ 21,000 iterations per view switch or filter change. The second call (line 551) runs O(sorted length × layout items length) which is even worse.

React Doctor diagnostic: *"This gets slow as your list grows because array.find() runs inside a loop, so build a Map once before the loop for instant lookups."*

## Target

Build a `Map<number, LayoutItem>` once before the loops, then use `Map.get()` for O(1) lookups:

```tsx
// Before the first loop (around line 522):
const layoutMap = new Map<number, LayoutItem>()
for (const li of engine.layoutItems) {
  layoutMap.set(li.bookmark.id, li)
}

// Line 525:
const firstItem = layoutMap.get(firstBookmark.id)

// Line 551:
const item = layoutMap.get(bm.id)
```

## Repo conventions to follow

- The file uses `Map` elsewhere (e.g., `engine.activeMap`, `engine.elToBookmark`).
- `LayoutItem` type already has a `bookmark` property with numeric `id`.
- The buildScrubberData function (`useCallback` at lines ~473–559) uses engine refs.

## Steps

1. At `hooks/useBookmarkViewer.ts:522`, before the `for (const week of weeks)` loop, add:
   ```tsx
   const layoutMap = new Map<number, LayoutItem>()
   for (const li of engine.layoutItems) {
     layoutMap.set(li.bookmark.id, li)
   }
   ```

2. At line 525, replace:
   ```tsx
   const firstItem = engine.layoutItems.find((li) => li.bookmark.id === firstBookmark.id);
   ```
   with:
   ```tsx
   const firstItem = layoutMap.get(firstBookmark.id)
   ```

3. At line 551, replace:
   ```tsx
   const item = engine.layoutItems.find((li) => li.bookmark.id === bm.id);
   ```
   with:
   ```tsx
   const item = layoutMap.get(bm.id)
   ```

4. Verify that `engine.layoutItems` is not empty when `buildScrubberData` runs (it always has at least the filtered items).

## Boundaries

- Do NOT change the `weeks` loop structure or the `sorted` loop structure.
- Do NOT change `engine.layoutItems` mutation timing.
- Keep the lookup behavior identical — `find` returns the first match, but `id` is unique per bookmark so `Map.get` returns the same result.

## Verification

- **Mechanical**: `npm run build` passes. `npx react-doctor@latest --scope changed` clears the `js-index-maps` diagnostics.
- **Behavior check**: Switch views, apply filters, confirm the scrubber renders correctly with all week markers and anchors.
- **Done when**: diagnostics clear, build passes, scrubber behavior unchanged.
