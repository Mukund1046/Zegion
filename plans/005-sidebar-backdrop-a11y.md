# 005 — Make sidebar backdrop keyboard-accessible

- **Status**: TODO
- **Commit**: b7fc021
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Rule**: react-doctor/click-events-have-key-events, react-doctor/no-static-element-interactions
- **Estimated scope**: 1 file, 1 element changed (~5 lines)

## Problem

At `components/BookmarksViewer.tsx:252-254`:

```tsx
<div
  className={`sidebar-backdrop${state.sidebarOpen ? " open" : ""}`}
  onClick={() => actions.setSidebarOpen(false)}
/>
```

The sidebar backdrop is a `<div>` with an `onClick` handler but:
- No `role` attribute — screen readers don't announce it as interactive
- No keyboard handler — keyboard users can't dismiss the sidebar with Enter/Space
- No `tabIndex` — it's not focusable by keyboard navigation

React Doctor diagnostics:
- *"Keyboard users can't trigger this click handler because there's no keyboard one"*
- *"Screen reader users can't tell this click handler is interactive because it has no `role`"*

## Target

Add `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler that triggers on Enter/Space:

```tsx
<div
  className={`sidebar-backdrop${state.sidebarOpen ? " open" : ""}`}
  role="button"
  tabIndex={0}
  onClick={() => actions.setSidebarOpen(false)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      actions.setSidebarOpen(false)
    }
  }}
/>
```

## Repo conventions to follow

- Other interactive elements in the file use `onKeyDown` with key checks (see line 1590 in useBookmarkViewer.ts: `if (event.key === "Escape" && ...)`).
- The repo uses standard React event handlers with arrow functions.

## Steps

1. At `components/BookmarksViewer.tsx:252`, add `role="button"` and `tabIndex={0}` to the sidebar backdrop `<div>`.

2. Add `onKeyDown` handler that calls `actions.setSidebarOpen(false)` on `"Enter"` or `" "` (Space).

3. Re-read the surrounding code to ensure no other backdrop elements need the same treatment.

## Boundaries

- Do NOT change the CSS class logic or the `onClick` behavior.
- Do NOT add ARIA attributes to other elements.
- The backdrop is only rendered when the sidebar system is active; no effect on other views.

## Verification

- **Mechanical**: `npm run build` passes. `npx react-doctor@latest --scope changed` clears both `click-events-have-key-events` and `no-static-element-interactions` for the backdrop element at line 252.
- **Behavior check**: Open the sidebar with the hamburger button. Press Tab until the backdrop is focused, then press Enter or Space — the sidebar should close. Clicking the backdrop still works. Screen reader should announce the backdrop as a button.
- **Done when**: diagnostics clear, build passes, keyboard and mouse dismissal both work.
