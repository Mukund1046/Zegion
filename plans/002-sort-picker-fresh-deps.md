# 002 — Fix stale deps restarting animations every render

- **Status**: TODO
- **Commit**: b7fc021
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: react-doctor/no-effect-with-fresh-deps, react-doctor/exhaustive-deps
- **Estimated scope**: 1 file, 10 lines changed

## Problem

At `components/ui/sort-picker.tsx:280-281`:

```tsx
const gapSpringConf = { ...GAP_SPRING, ...m?.gapSpring }
const iconSpringConf = { ...ICON_SPRING, ...m?.iconSpring }
```

Both are spread objects created inline every render. They're used as deps in two `useEffect` blocks:

```tsx
  useEffect(() => {
    const target = isEditing ? openGapVal : 0
    if (shouldReduceMotion) { gap.jump(target); return }
    const ctrl = animate(gap, target, gapSpringConf)
    return () => ctrl.stop()
  }, [isEditing, openGapVal, shouldReduceMotion, gap, gapSpringConf])

  useEffect(() => {
    const target = isEditing ? 1 : 0
    if (shouldReduceMotion) { iconProgress.jump(target); return }
    const ctrl = animate(iconProgress, target, iconSpringConf)
    return () => ctrl.stop()
  }, [isEditing, shouldReduceMotion, iconProgress, iconSpringConf])
```

Because `gapSpringConf` and `iconSpringConf` are new objects every render, both effects fire and restart their animations on every React state update — even when the spring config values haven't changed. This causes animation stutter during DialKit interaction.

React Doctor diagnostics:
- *"`gapSpringConf` is rebuilt every render, so `useEffect` runs every time"*
- *"`iconSpringConf` is rebuilt every render, so `useEffect` runs every time"*
- *"Your useEffect runs every render because dep `gapSpringConf` is a new object built fresh each time"*

## Target

Move the config object creation inside each effect body so the objects don't exist at the dependency level. This eliminates the fresh-dep problem entirely.

```tsx
  useEffect(() => {
    const target = isEditing ? openGapVal : 0
    if (shouldReduceMotion) { gap.jump(target); return }
    const ctrl = animate(gap, target, { ...GAP_SPRING, ...m?.gapSpring })
    return () => ctrl.stop()
  }, [isEditing, openGapVal, shouldReduceMotion, gap])

  useEffect(() => {
    const target = isEditing ? 1 : 0
    if (shouldReduceMotion) { iconProgress.jump(target); return }
    const ctrl = animate(iconProgress, target, { ...ICON_SPRING, ...m?.iconSpring })
    return () => ctrl.stop()
  }, [isEditing, shouldReduceMotion, iconProgress])
```

Also remove the stale in render constants since they're no longer referenced outside the effects.

## Repo conventions to follow

- The file uses inline effect callbacks with `animate()` from `motion`.
- Existing pattern: `const ctrl = animate(..., springConf)` plus `return () => ctrl.stop()`.
- The repo prefers avoiding unnecessary `useMemo` when a simple inline in the effect body works.

## Steps

1. At `components/ui/sort-picker.tsx:280-281`, delete both lines:
   ```tsx
   const gapSpringConf = { ...GAP_SPRING, ...m?.gapSpring }
   const iconSpringConf = { ...ICON_SPRING, ...m?.iconSpring }
   ```

2. At line 300, replace `gapSpringConf` with `{ ...GAP_SPRING, ...m?.gapSpring }`.

3. At line 302, remove `gapSpringConf` from the dependency array.

4. At line 337, replace `iconSpringConf` with `{ ...ICON_SPRING, ...m?.iconSpring }`.

5. At line 339, remove `iconSpringConf` from the dependency array.

6. Verify `m` is still used elsewhere in the component (it is — lines 284, depending on `dial?.Motion`).

## Boundaries

- Do NOT change the `swaySpringConf` at line 282 — it's used differently (as a `useSpring` config, not an effect dep).
- Do NOT change the animation logic or target values.
- Keep the change behavior-preserving.

## Verification

- **Mechanical**: `npm run build` passes. `npx react-doctor@latest --scope changed` clears the `exhaustive-deps` and `no-effect-with-fresh-deps` diagnostics for `sort-picker.tsx`. Confirm the overall score does not regress.
- **Behavior check**: Open the SortPicker, adjust DialKit controls (stiffness, damping, mass). Confirm the gap animation and icon animation still run smoothly without stutter every render.
- **Profiler**: (Optional) Record a profile in React DevTools before and after. Confirm the effects no longer fire on every unrelated state update.
- **Done when**: diagnostics clear, build passes, animation behavior unchanged.
