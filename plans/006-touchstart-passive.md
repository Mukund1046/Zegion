# 006 — Add passive flag to touchstart listener

- **Status**: TODO
- **Commit**: b7fc021
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: react-doctor/client-passive-event-listeners
- **Estimated scope**: 1 file, 1 line changed

## Problem

At `hooks/useBookmarkViewer.ts:1663`:

```tsx
viewport.addEventListener("touchstart", onTouchStart);
```

The `touchstart` listener is added without `{ passive: true }`. The browser must wait for this handler to execute before it can start scrolling, because a non-passive `touchstart` can call `preventDefault()` to block scrolling. On touch devices, this delays every scroll start.

React Doctor diagnostic: *"touchstart listener without { passive: true } makes scrolling janky for your users."*

Note: `touchmove` at line 1664 correctly has `{ passive: false }` because the wheel/touch handlers do call `preventDefault()` for the canvas view. But `touchstart` does not prevent default.

## Target

Add `{ passive: true }` to the `touchstart` listener:

```tsx
viewport.addEventListener("touchstart", onTouchStart, { passive: true });
```

## Repo conventions to follow

- The effect cleanup at line 1671 ff. uses `removeEventListener` without the options argument. `removeEventListener` with `{ passive: true }` needs the SAME options to successfully remove. Update the cleanup too, or verify that omitting options still removes (it does — the browser matches by handler reference, not options).

Actually, to be safe, update the `removeEventListener` line:

```tsx
viewport.removeEventListener("touchstart", onTouchStart);
```

The browser's event listener removal matches by handler reference even when the original registration used options, so no change is needed on the remove line. Verified: `removeEventListener` matches by `type` and `handler` reference; the `options` parameter only needs to match if `once` or `signal` was set.

## Steps

1. At `hooks/useBookmarkViewer.ts:1663`, change:
   ```tsx
   viewport.addEventListener("touchstart", onTouchStart);
   ```
   to:
   ```tsx
   viewport.addEventListener("touchstart", onTouchStart, { passive: true });
   ```

2. Confirm the `removeEventListener` at line 1678 (or nearby) for `"touchstart"` does NOT need options — verify it exists and has only 2 args.

## Boundaries

- Do NOT change `touchmove` (it needs `{ passive: false }` because it calls `preventDefault()`).
- Do NOT change `scroll`, `wheel`, or other listeners.
- Confirm `onTouchStart` does NOT call `event.preventDefault()` — if it does, this plan needs to be aborted.

Verify: Read `onTouchStart` handler (around line 1480+) — confirm no `preventDefault()` call.

## Verification

- **Mechanical**: `npm run build` passes. `npx react-doctor@latest --scope changed` clears the `client-passive-event-listeners` diagnostic.
- **Behavior check**: On a touch device (or Chrome DevTools device emulation), scroll the bookmark grid. Confirm scrolling starts immediately without delay. Canvas/drag interactions still work.
- **Done when**: diagnostics clear, build passes, touch scroll responsive.
