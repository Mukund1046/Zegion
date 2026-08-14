# UX_SPEC.md

Established UX principles, from implementation and design history.

## Principles

1. **Media-first.** Media view is the default; the corpus is browsed by what it looks like, not by text.
2. **Information-dense but calm.** Filters, counts, and stats are present but quiet (opacity-reduced icons, mono labels, subtle pills).
3. **Minimal chrome.** Toolbar consolidates into an auto-hiding bottom bar + overflow popover. No permanent sidebar.
4. **Buttery motion.** Springs (motion), FLIP animations, critically-damped geometry. Motion communicates causality (lightbox opens from the card; cards glide when columns change).
5. **Automatic UI reveal.** Scrubber appears when the pointer nears the right edge; scroll-to-top FAB appears after 800px; bottom bar hides on scroll-out. Nothing permanent competes with content.
6. **Keyboard-first where it matters.** `⌘K` search, arrow keys in search, Enter/Space opens focused card, `Esc` closes lightbox, `Shift+P` toggles profiler.
7. **Everything persisted.** View, zoom, folder, search, sort, facet, dark mode restored from `localStorage`.
8. **Low-spec graceful degradation.** Smaller pool/buffer, no interpolation on weak devices.
9. **Accessible basics.** Skip link, `role="dialog"`/`aria-modal` lightbox, aria-labels on icon buttons, focusable cards with `role="button"`, keyboard-open in lightbox.
10. **Legible dates at a glance.** "Today", "N days ago", "N week ago", week-of previews in the scrubber.
11. **The surface must never jank.** This drives the feed engine contract and the spatial FLUID-ZOOM INVARIANT. Motion quality is a feature.

## View modes

- **Media view** — image-first masonry; filters to bookmarks with images; 2/3/5 columns responsive.
- **Cards view** — full-text cards with author/handle/body/timeline/stats; 1/3/4 columns responsive.
- **Spatial prototype (/spatial)** — infinite zooming surface (research).

## Interaction conventions

- **Zoom = density** in the viewer (column count ± step, glide); **Zoom = magnifier** in the spatial prototype (continuous).
- **Scrubber**: hover near right edge to activate; hover marker → preview card; click → smooth jump; drag thumb.
- **Lightbox**: click card opens; click overlay/close closes; Escape closes; resizes/reframes live with visualViewport; video/GIF shows "Play on Twitter" pill.
- **Context menu**: right-click a card → copy link/text/handle or open on X; copy shows a success state.
- **Search prefixes**: `@author`, `#category`, `domain:`, `!domain:`, `sites:`, `!sites:`.
- **Spatial**: scroll/trackpad pan, Ctrl+scroll zoom, `−/+/Fit/1:1/Reset`, minimap click-to-jump, cursor-anchored zoom.

## Visual language

- Host Grotesk body, Faculty Glyphic brand, DM Mono for metadata/handles.
- Squircle corners (figma-squircle `SquircleClip`), concentric radii.
- DialKit-driven live tuning of buttons, popovers, search, and the spatial settle panel.
- Dark/light themes via `body.dark-mode`; theme transitions.
- Icons from HugeIcons core-free.

## Known UX tradeoffs (accepted)

- **One-frame radius snap** at the spatial fluid→screen flip (see DECISIONS.md D-01): scaling the radius during zoom would cost ~55% of engine frames, so the snap is accepted.
- **Scrubber only in feed views** (media/card), not in canvas/pan modes.
- **No editing/deleting** bookmarks — read-only by design.