# React Improvement Plans

**Base commit**: `b7fc021`
**Status key**: TODO → IN PROGRESS → DONE

## Execution summary

All 9 plans executed. React Doctor score improved from **21 → 44** (+109%).

| Order | Plan | Severity | Category | Status | Notes |
|-------|------|----------|----------|--------|-------|
| 1 | [001 — ctrlRef in render](001-ctrl-ref-in-render.md) | MED | Bugs | DONE | `useEffect` wraps `ctrlRef.current = controller` |
| 2 | [002 — sort-picker fresh deps](002-sort-picker-fresh-deps.md) | MED | Perf | DONE | Config inlined inside effect bodies, deps removed |
| 3 | [003 — layout items index map](003-layout-items-index-map.md) | MED | Perf | DONE | `Map<id, LayoutItem>` replaces `array.find()` in loops |
| 4 | [004 — proximity-sidebar derived state](004-proximity-sidebar-derived-state.md) | MED | Bugs | DONE | `useMemo` replaces `useState` + `useEffect` |
| 5 | [005 — sidebar backdrop a11y](005-sidebar-backdrop-a11y.md) | MED | A11y | DONE | Added `role`, `tabIndex`, `aria-label`, `onKeyDown` |
| 6 | [006 — touchstart passive](006-touchstart-passive.md) | MED | Perf | DONE | Added `{ passive: true }` |
| 7 | [007 — lightbox close button type](007-lightbox-close-button-type.md) | LOW | Bugs | DONE | Added `type="button"` |
| 8 | [008 — hoist Intl formatters](008-hoist-intl-formatters.md) | LOW | Perf | DONE | `DATE_FORMATTER` hoisted to module scope |
| 9 | [009 — remove unused deps/file](009-remove-unused-deps-and-file.md) | LOW | Maint | DONE | 6 deps removed, `duration-picker.tsx` deleted |

## Remaining diagnostics (accepted trade-offs / false positives)

| Rule | File | Reason |
|------|------|--------|
| `no-ref-current-in-render` | `useBookmarkViewer.ts:130` | Deliberate trade-off: needed to fix stale closure in `applyView` timeout |
| `effect-needs-cleanup` | `squircle-clip.tsx:46` | False positive: ref callback handles unmount (disconnects on `null`) |
| `effect-needs-cleanup` | `useBookmarkViewer.ts:1023` | False positive: `clone.remove()` in `closeLightbox` cleans up listeners |
| `effect-needs-cleanup` | `proximity-sidebar.tsx:294` | False positive: cleanup IS present (lines 355–363) |
| `exhaustive-deps` | `sort-picker.tsx:300, 337` | `m` comes from stable parent context; effect only re-runs when user adjusts DialKit controls (intended) |
| `no-static-element-interactions` | `BookmarksViewer.tsx:405` | False positive: lightbox overlay backdrop dismiss is Escape-key driven; `onClick` is convenience |
| `prefer-tag-over-role` | `BookmarksViewer.tsx:254` | Acceptable: `<div role="button">` avoids button default border/padding fighting the backdrop CSS |

## Missed opportunities (not yet planned)

- Error boundary around `<BookmarksViewer>`
- Lightbox clone guard (try/finally on animation promise)
- State context splitting for toolbar components
