# 007 — Add explicit type to lightbox close button

- **Status**: TODO
- **Commit**: b7fc021
- **Severity**: LOW
- **Category**: Bugs & correctness
- **Rule**: react-doctor/button-has-type
- **Estimated scope**: 1 file, 1 line changed

## Problem

At `components/BookmarksViewer.tsx:406`:

```tsx
<button
  className="lightbox-close"
  aria-label="Close"
  onClick={(event) => {
    event.stopPropagation();
    actions.closeLightbox();
  }}
>
```

The `<button>` has no explicit `type` attribute. Buttons default to `type="submit"`, which can accidentally submit a parent `<form>` if one is introduced later.

React Doctor diagnostic: *"Your users can submit the form by accident because a `<button>` with no `type` defaults to submit."*

## Target

Add `type="button"` to the button:

```tsx
<button
  type="button"
  className="lightbox-close"
  aria-label="Close"
  onClick={(event) => {
    event.stopPropagation();
    actions.closeLightbox();
  }}
>
```

## Steps

1. At `components/BookmarksViewer.tsx:406`, add `type="button"` after the opening `<button` tag, before `className`.

## Boundaries

- Do NOT change other buttons in the file (check if any others also lack `type`).
- Do NOT change the `onClick`, `aria-label`, or className.

## Verification

- **Mechanical**: `npm run build` passes. `npx react-doctor@latest --scope changed` clears the `button-has-type` diagnostic.
- **Behavior check**: Open the lightbox, click the close button. It works the same as before.
- **Done when**: diagnostics clear, build passes.
