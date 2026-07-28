# Repository Guidelines

## Project Structure & Module Organization

This is a self-contained Next.js app for browsing exported X bookmarks. The UI is built with React Server Components and a client-side bookmark viewer hook. Backend logic lives in `lib/`: `export-bookmarks.js` and `sync-folders.js` are spawned as child processes, `config.js` centralizes environment and path resolution for those scripts, `native-config.ts` provides the same for the Next.js runtime, and `server-jobs.ts` orchestrates sync/reindex operations. Static assets are in `public/icons/`. Generated data such as `bookmarks-data.json`, `folders-data.json` live under `data/output/`, and local bookmark JSONL data can go under `data/bookmarks/`.

## Build, Test, and Development Commands

- `npm install`: install local dependencies.
- `npm run dev`: start the Next.js dev server on `http://localhost:3001`.
- `npm run build`: production build.
- `npm start`: start the production server on port 3001.

Typical local flow: `npm install`, copy `.env.example` to `.env` with your X cookies, run `npm run dev`, then use the Sync / Re-index buttons in the UI.

## Field Theory Classification on Windows

The app lives under `zeleon`; run Field Theory commands from that directory. In PowerShell, avoid plain `ft` because it is a built-in alias for `Format-Table`. Prefer the local Node entrypoint:

- `node node_modules\fieldtheory\bin\ft.mjs classify --engine codex`
- `node node_modules\fieldtheory\bin\ft.mjs classify-domains --engine codex`
- `node lib\export-bookmarks.js`

The local `fieldtheory` install has a Windows-specific Codex launcher patch in `node_modules\fieldtheory\dist\engine.js`. Codex must be invoked through `process.execPath` plus `C:\Users\hp\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`; spawning bare `codex` from Node can fail with `spawnSync codex EPERM` even though `codex --version` works in PowerShell. If `npm install` or dependency cleanup overwrites `node_modules`, restore that patch before running LLM classification.

Check classification distribution before and after exports with:

```powershell
node -e "const d=require('./data/output/bookmarks-data.json'); const cats={}; d.bookmarks.forEach(b=>{const c=b.category||'unclassified'; cats[c]=(cats[c]||0)+1}); console.log('Categories:', cats)"
```

## Coding Style & Naming Conventions

Follow the existing JavaScript/TypeScript style: 2-space indentation, semicolons, `const`/`let`, and small helper functions. Use `camelCase` for variables and functions, `UPPER_SNAKE_CASE` for true constants, and `kebab-case` for script filenames. Keep browser logic dependency-light and colocated unless a file becomes meaningfully separate.

## Testing Guidelines

There is no formal automated test suite configured yet. Validate changes by running the full export workflow and checking the viewer in the browser. For UI work, verify all three modes (`Media`, `Cards`, `Canvas`), lightbox behavior, and folder filtering. For data-script changes, confirm the expected JSON files are regenerated without errors.

## Commit & Pull Request Guidelines

Keep commits focused with short imperative subjects. Pull requests should describe the user-visible change, note any config or cookie-related impacts, and include screenshots for UI changes.

## Security & Configuration Tips

Never commit `.env`, bookmark exports, generated JSON, or `data/` contents. Use `.env.example` for documented defaults only. Treat `X_CT0` and `X_AUTH_TOKEN` as secrets and re-test folder sync if X rotates session cookies.
