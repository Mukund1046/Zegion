# 008 — Hoist Intl formatters to module scope

- **Status**: TODO
- **Commit**: b7fc021
- **Severity**: LOW
- **Category**: Performance
- **Rule**: react-doctor/js-hoist-intl
- **Estimated scope**: 1 file, ~8 lines changed

## Problem

At `lib/bookmark-utils.ts:17,241,251`:

```tsx
// Line 17:
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

// Line 241:
const dateFormatter = new Intl.DateTimeFormat("en-US", { ... });

// Line 251:
const countFormatter = new Intl.NumberFormat("en-US", { ... });
```

These `Intl` formatters are created inside exported functions. `new Intl.DateTimeFormat()` and `new Intl.NumberFormat()` are expensive to construct (locale data lookup, pattern compilation). They're rebuilt on every call to the containing function, even though they're constant.

React Doctor diagnostic: *"This is slow because new Intl.DateTimeFormat() rebuilds on every call inside a function."*

## Target

Hoist the formatter creation to module scope (top of file, outside any function):

```tsx
// At the top of the file (after imports):
const DATE_FORMATTER_MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });

// Inside formatDate:
// Replace `new Intl.DateTimeFormat("en-US", {...})` with the hoisted constant
```

But wait — each formatter may have different options. They need to remain distinct. The fix is to create each unique formatter once at module scope:

```tsx
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short" });
const DATE_FORMATTER_FULL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const COUNT_FORMATTER = new Intl.NumberFormat("en-US", { notation: "compact" });
```

Then inside the functions, reference the hoisted constant instead of calling `new` each time.

## Repo conventions to follow

- The file uses `UPPER_SNAKE_CASE` for true constants (e.g., `MEDIA_COLS`, `CARD_COLS`, `GAP`, `BUFFER`).
- Module-scoped variables are declared at the top of the file.

## Steps

1. At `lib/bookmark-utils.ts`, after the imports and before any function declarations, add:
   ```tsx
   const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short" });
   const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
     month: "short",
     day: "numeric",
     year: "numeric",
   });
   const COUNT_FORMATTER = new Intl.NumberFormat("en-US", {
     notation: "compact",
     maximumSignificantDigits: 3,
   });
   ```

2. Find line 17 (inside `formatNavigatorDate` or wherever the month formatter is created) and replace the `new Intl.DateTimeFormat(...)` with `MONTH_FORMATTER`.

3. Find line 241 (inside `formatDate` or similar) and replace the `new Intl.DateTimeFormat(...)` with `DATE_FORMATTER`.

4. Find line 251 (inside `formatCount` or similar) and replace the `new Intl.NumberFormat(...)` with `COUNT_FORMATTER`.

5. Re-read the diff and remove any now-unnecessary `new` calls.

## Boundaries

- Do NOT change the locale or formatting options — they must stay identical.
- Do NOT change function signatures or behavior.
- The formatters are frozen at module initialization time, which is fine since they're locale-constant.

## Verification

- **Mechanical**: `npm run build` passes. `npx react-doctor@latest --scope changed` clears the `js-hoist-intl` diagnostics.
- **Behavior check**: Load the app and confirm dates and counts render with the same formatting as before (e.g., "Jan 15, 2024", "1.2K likes").
- **Done when**: diagnostics clear, build passes, formatting unchanged.
