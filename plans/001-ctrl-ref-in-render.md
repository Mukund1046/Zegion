# 001 — Move ctrlRef write to useEffect

- **Status**: TODO
- **Commit**: b7fc021
- **Severity**: MEDIUM
- **Category**: Bugs & correctness
- **Rule**: react-doctor/no-ref-current-in-render
- **Estimated scope**: 1 file, 3 lines changed

## Problem

At `components/ui/sort-picker-dial.tsx:82`:

```tsx
  ctrlRef.current = controller
```

`ctrlRef.current = controller` is written during render. React 19 may discard or replay render work, so a ref mutation during render can leak from UI that never commits. If render is aborted, `ctrlRef.current` points to an orphaned DialKit controller whose subscriptions and timers are never cleaned up.

The React Doctor diagnostic: *"This ref is mutated during render. React can replay or discard render work, so the mutation can leak from UI that never commits."*

## Target

Move the ref write into a `useEffect` so it runs after commit, not during render:

```tsx
useEffect(() => {
  ctrlRef.current = controller
}, [controller])
```

## Repo conventions to follow

- The file already imports `useEffect` from React (line 3).
- The existing `useEffect` at line 63 shows the repo convention: destructure `useEffect` from the React import, write the effect inline.

## Steps

1. At `components/ui/sort-picker-dial.tsx:83`, replace `ctrlRef.current = controller` with:
   ```tsx
   useEffect(() => { ctrlRef.current = controller }, [controller])
   ```
2. Verify `useEffect` is already imported (it is — line 3: `import { useEffect, ... }`).
3. Re-read the diff and confirm no other changes.

## Boundaries

- Do NOT change the controller creation at line 63–81.
- Do NOT change any other ref reads or writes.
- Keep the change behavior-preserving.

## Verification

- **Mechanical**: `npm run build` passes. `npx react-doctor@latest --scope changed` no longer reports `no-ref-current-in-render` for `sort-picker-dial.tsx:82`.
- **Behavior check**: Open the SortPicker dial, adjust controls, confirm the dial still responds to user input.
- **Done when**: the diagnostic is clear, build passes, and the dial behaves identically.
