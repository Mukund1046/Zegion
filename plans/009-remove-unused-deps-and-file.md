# 009 — Remove unused dependencies and unused file

- **Status**: TODO
- **Commit**: b7fc021
- **Severity**: LOW
- **Category**: Maintainability & architecture
- **Rule**: deslop/unused-dependency, deslop/unused-file
- **Estimated scope**: 2 files, ~11 lines changed (package.json), 1 file deleted

## Problem

React Doctor reports 6 unused dependencies and 1 unused file:

| Dependency/File | Location |
|----------------|----------|
| `@base-ui/react` | `package.json` |
| `@hugeicons/static` | `package.json` |
| `class-variance-authority` | `package.json` |
| `lucide-react` | `package.json` |
| `motion-dom` | `package.json` |
| `tw-animate-css` | `package.json` |
| `components/ui/duration-picker.tsx` | unused file |

These unused dependencies add install time, `node_modules` bloat, and supply-chain surface. The unused file adds maintenance surface without shipping any code.

## Target

Remove the 6 unused deps from `package.json` and delete `components/ui/duration-picker.tsx`.

## Repo conventions to follow

- `package.json` uses 2-space indentation.
- Dependencies are in alphabetical order.
- No `npm uninstall` needed — `npm install` after editing `package.json` will update `node_modules`.

## Steps

1. At `package.json:12-14`, remove the `"@base-ui/react"` entry.
2. At `package.json:13` (shifts after removal), remove the `"@hugeicons/static"` entry.
3. Remove `"class-variance-authority"` entry.
4. Remove `"lucide-react"` entry.
5. Remove `"motion-dom"` entry.
6. Remove `"tw-animate-css"` entry.
7. Run `npm install` to sync `package-lock.json` and `node_modules`.
8. Delete `components/ui/duration-picker.tsx`.

## Boundaries

- Do NOT remove any dependency that is actually imported anywhere in the codebase. Double-check by searching for imports of each package.
  - `lucide-react`: search for `from "lucide-react"` — likely false positive (might be used in icon components)
  - `class-variance-authority`: search for `from "class-variance-authority"` or `cva(` calls
  - `motion-dom`: should be a transitive dep of `motion` — verify before removing
  - `tw-animate-css`: check for any CSS `@import` or PostCSS config references
  - `@base-ui/react`: check for imports
  - `@hugeicons/static`: check for imports

If any are actually used, skip them and note the exception.

## Verification

- **Mechanical**: `npm install` succeeds. `npm run build` passes. `npx react-doctor@latest --scope changed` clears the unused-dependency and unused-file diagnostics.
- **Behavior check**: Load the app and confirm no missing module errors. All UI features (icons, animations, styling) render correctly.
- **Done when**: diagnostics clear, build passes, app loads without errors.
