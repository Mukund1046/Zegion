# 004 — Replace derived state with useMemo

- **Status**: TODO
- **Commit**: b7fc021
- **Severity**: MEDIUM
- **Category**: Bugs & correctness
- **Rule**: react-doctor/no-derived-state
- **Estimated scope**: 1 file, ~15 lines changed

## Problem

At `components/ui/proximity-sidebar.tsx:298`:

```tsx
const [detectedKinds, setDetectedKinds] = useState<Record<string, SectionKind>>({})

useEffect(() => {
  const kinds = sections.reduce<Record<string, SectionKind>>(
    (nextKinds, section) => {
      nextKinds[section.id] =
        section.kind || section.level
          ? getSectionKind(section)
          : getElementSectionKind(section.id) ?? getSectionKind(section)
      return nextKinds
    },
    {}
  )
  setDetectedKinds(kinds)
}, [sectionIds, sections])
```

`detectedKinds` is derived entirely from `sections` (via `sectionIds`). Storing it in state and synchronizing via `useEffect` causes an extra render cycle: the component renders with the old value, the effect runs, `setDetectedKinds` is called, and the component re-renders.

React Doctor diagnostic: *"Storing 'detectedKinds' in state when you can derive it from other values costs an extra render."*

## Target

Compute `detectedKinds` during render using `useMemo` instead of `useEffect` + `useState`:

```tsx
const detectedKinds = useMemo(() => {
  return sections.reduce<Record<string, SectionKind>>(
    (nextKinds, section) => {
      nextKinds[section.id] =
        section.kind || section.level
          ? getSectionKind(section)
          : getElementSectionKind(section.id) ?? getSectionKind(section)
      return nextKinds
    },
    {}
  )
}, [sectionIds, sections])
```

Remove the `useState` and `useEffect` that managed it.

## Repo conventions to follow

- The file already imports `useMemo` at line 8: `import { useMemo, useState, useEffect, ... }`.
- The repo prefers `useMemo` over effect-driven state for derived values (standard React pattern).

## Steps

1. At `components/ui/proximity-sidebar.tsx`, find the `useState` declaration for `detectedKinds` and replace it with `useMemo` as shown above.

2. Delete the entire `useEffect` block (lines 285–299 in current code) that calls `setDetectedKinds`.

3. Search the file for all references to `detectedKinds` — they should now read from the `useMemo` variable instead of state. Confirm the variable name stays `detectedKinds`.

4. Re-read the diff to ensure no unused imports remain (`useEffect` is still used elsewhere in the file, so keep the import).

## Boundaries

- Do NOT change the reduce logic or the `getSectionKind`/`getElementSectionKind` calls.
- Do NOT change other state variables or effects in the component.
- The change is purely structural — the computed value is identical.

## Verification

- **Mechanical**: `npm run build` passes. `npx react-doctor@latest --scope changed` clears the `no-derived-state` diagnostic for `proximity-sidebar.tsx`.
- **Behavior check**: Navigate the sidebar sections. Confirm detected kinds (folder icons/colors) render correctly without visual change.
- **Done when**: diagnostics clear, build passes, sidebar behavior unchanged.
