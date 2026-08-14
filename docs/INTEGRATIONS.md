# INTEGRATIONS.md

## Integration: X (Twitter) GraphQL

- **Purpose:** Sync X bookmark folders (`sync-folders.js`).
- **Authentication:** X session cookies `ct0` (CSRF) + `auth_token`; either auto-read from the local browser profile (Field Theory) or pasted manually.
- **Endpoints:** `BookmarkFolderTweetsQuery` (and related) via `https://api.twitter.com/graphql/...` with the hardcoded public bearer token in `sync-folders.js`. Field Theory CLI performs the raw `ft sync` bookmarks export.
- **Rate limits:** Not formally tracked; `--max-minutes 30` bounds sync runs.
- **Failure modes:** Cookie rotation (401/403), folder query shape changes, network. Folder sync failure is non-fatal (warning surfaced).
- **Required environment:** `X_CT0`, `X_AUTH_TOKEN` (or browser auto-detection).
- **Credentials:** Stored in `.env` and/or `cookies-config.json` (manual). Secrets.
- **Security requirements:** Never log cookie values; pass only via child-process env; never commit `.env` or generated data.
- **Current status:** Operational for bookmarks sync; folder sync is the fragile link (Firefox-tested; other browsers code paths exist).

## Integration: Field Theory CLI (`fieldtheory`)

- **Purpose:** Raw X bookmarks sync (`ft sync`), cache index (`ft index`), category/domain classification (`ft classify`, `ft classify-domains`, `ft list`).
- **Authentication:** Same X cookies.
- **Consumption:** Spawned by `server-jobs.ts` (`ft sync`/`ft index`/`ft list`) and `export-bookmarks.js` (`ft list`); classification is run manually per AGENTS.md.
- **Windows note:** `ft` is a PowerShell alias for `Format-Table`; use `node node_modules\fieldtheory\bin\ft.mjs ...`. Codex classification requires the local Windows launcher patch in `node_modules\fieldtheory\dist\engine.js` (Codex invoked via `process.execPath` + the `@openai\codex` bin path). Re-apply after dependency cleanup.
- **Current status:** Operational (with the patch).

## Integration: OpenAI Codex CLI (LLM classification)

- **Purpose:** Field Theory's `classify` / `classify-domains` engine for category/domain enrichment.
- **Usage:** Manual commands, not part of the app runtime.
- **Required environment:** Codex installed at `C:\Users\hp\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`.
- **Current status:** Operational (patched).

## Integration: Browser (Firefox primary; Chrome/Edge/Brave code paths)

- **Purpose:** Auto cookie discovery for sync.
- **Consumption:** `ft sync --browser <browser>`.
- **Current status:** Firefox exercised; others untested.

## Non-integrations (intentionally absent)

- No cloud database, no auth provider, no telemetry, no CDN.