# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Dev server on port 3001
- `npm run build` — Production build
- `npm run start` — Production server on port 3001
- `npm run lint` — TypeScript type check (`tsc --noEmit`)
- `npm run sync:folders` — Fetch X bookmark folders (requires cookies in `.env`)
- `npm run export:bookmarks` — Build `bookmarks-data.json` from fieldtheory JSONL

## Architecture

**Kairos** is a local-first X (Twitter) bookmarks browser. Single-page app, all client-side.

### Data flow

```
fieldtheory CLI (sync) → bookmarks.jsonl → export-bookmarks.js → bookmarks-data.json
                                                                     ↓
Next.js API routes (/api/bookmarks, /api/status, /api/sync, /api/reindex)
  → lib/server-jobs.ts (runs fieldtheory CLI via child_process, job lock)
  → JSON response served to the browser
```

`lib/server-jobs.ts` wraps CLI operations (sync, reindex, export) with a job lock to prevent concurrent runs. API routes are in `app/api/`. The `/api/bookmarks` route reads `bookmarks-data.json` from disk and returns it as JSON.

### App structure

- **`app/page.tsx`** → renders `<BookmarksViewer />`
- **`app/layout.tsx`** — root layout, loads Host Grotesk font, wraps with `<DialRoot>` (dialkit)
- **`components/BookmarksViewer.tsx`** — splits the UI into regions: Toolbar, Sidebar, Feed, Lightbox
- **`hooks/useBookmarkViewer.ts`** — the single large hook managing all state, virtual DOM pool, event handling, masonry layout, lightbox, scrubber, and animation loop
- **`lib/bookmark-utils.ts`** — pure utility functions: filtering, sorting, masonry layout, formatting, facet counting
- **`lib/types.ts`** — all TypeScript types (`Bookmark`, `SortConfig`, `FacetType`, `PersistedState`, etc.)

### Component libraries

| Directory | Contents |
|---|---|
| `components/ui/` | Core components: `sort-picker.tsx`, `sort-picker-dial.tsx`, `squircle-clip.tsx` |
| `components/animate-ui/` | Radix popover/dropdown-menu wrappers, highlight effect primitives |
| `components/unlumen-ui/` | Sidebar component (`sidebar-001.tsx`) |
| `components/sora-ui/` | Skeleton loading effects |

### UI rendering model

The feed uses a **virtual DOM pool** pattern:
1. `engineRef` stores a pool of ~260-420 pre-created DOM elements
2. On each frame, visible items are mapped to pool elements, off-screen elements are recycled
3. Two modes: **feed** (vertical scroll) and **canvas** (drag/pan, for non-feed views)
4. Animation loop runs via `requestAnimationFrame` — interpolates camera offset toward target offset

### State management

- All state in React `useState` within `useBookmarkViewer`
- Imperative engine state in `engineRef` (useRef) — avoids re-renders for animation/interaction state
- `localStorage` persists under key `kairos_state` (dark mode, folder, view, sort, search, facet, sidebar)
- Dark mode: `body.dark-mode` class toggle, CSS custom properties in `globals.css`

### Key libraries

- **Next.js 16** — App Router, API routes
- **React 19** — client components only
- **TypeScript 6.0** — strict mode, `@/*` path alias
- **Tailwind CSS v4** — `@import "tailwindcss"`, `@custom-variant dark (&:is(body.dark-mode *))`
- **motion v12** — `motion/react` for animations (springs, AnimatePresence)
- **dialkit** — configurable dial/panel system for the SortPicker
- **figma-squircle** — SVG path generation for squircle clip paths
- **radix-ui** — Popover, DropdownMenu primitives
- **@hugeicons/core-free-icons** — icon set
- **fieldtheory** — CLI for bookmark syncing and classification

### Data pipeline scripts (Node.js, in `lib/`)

- `lib/export-bookmarks.js` — reads `bookmarks.jsonl`, merges folder/classification data, writes `bookmarks-data.json`
- `lib/sync-folders.js` — fetches X bookmark folders via GraphQL API
- `lib/config.js` — shared environment variable and path resolution
- `lib/native-config.ts` — TypeScript config utilities for the Next.js API routes