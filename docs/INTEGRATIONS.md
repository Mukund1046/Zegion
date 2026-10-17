# INTEGRATIONS.md

## Integration: X (Twitter) GraphQL

- **Purpose:** Sync X bookmark folders (`sync-folders.js`).
- **Authentication:** X session cookies `ct0` (CSRF) + `auth_token`; either auto-read from the local browser profile (Field Theory) or pasted manually.
- **Endpoints:** `BookmarkFolderTweetsQuery` (and related) via `https://api.twitter.com/graphql/...` with the hardcoded public bearer token in `sync-folders.js`. Field Theory CLI performs the raw `ft sync` bookmarks export.
- **Rate limits:** Not formally tracked; `--max-minutes 30` bounds sync runs.
- **Failure modes:** Cookie rotation (401/403), folder query shape changes, network. Folder sync failure is non-fatal (warning surfaced).
- **Required setup:** Choose Firefox Auto or Manual in Sync settings. Each machine needs its own signed-in Firefox profile or manually entered session cookies.
- **Configuration:** Stable per-user `~/.ft-bookmarks/cookies-config.json` by default; `FT_DATA_DIR` relocates this stable root and `X_COOKIE_CONFIG` can specify an explicit file. Legacy config beside the old JSONL path is migrated without deleting the original.
- **Credential protection:** Windows stores manual credentials using the current user's DPAPI through PowerShell; DPAPI-protected settings are not portable to another account/device. Other platforms use owner-only directory/file permissions and do not claim at-rest encryption. GET APIs expose only a `hasCookies` boolean.
- **Transport:** Manual bookmark-sync credentials go to the local Field Theory wrapper on stdin, not command-line arguments. Folder-sync credentials also use stdin; child stderr and cookie values are not forwarded to the UI.
- **Firefox requirements:** Zegion delegates Firefox profile discovery to Field Theory's `ft sync --browser firefox` path. Keep the local Field Theory/Node runtime compatible with its cookie reader; a live authenticated X account is required for an end-to-end auth test.
- **Current status:** Auto Firefox and manual paths are implemented. Actual X authentication requires a user's local session and is not covered by repository-only tests; see the sync verification notes in the handoff.

## Integration: Field Theory CLI (`fieldtheory`)

- **Purpose:** Raw X bookmarks sync (`ft sync`), cache index (`ft index`), category/domain classification (`ft classify`, `ft classify-domains`, `ft list`).
- **Authentication:** Same X cookies.
- **Consumption:** Spawned by `server-jobs.ts` for `ft sync`, `ft index`, and native `ft classify`; `export-bookmarks.js` uses `ft list` to enrich the viewer export.
- **Windows note:** The application invokes the local dependency by its Node entrypoint, so no globally installed CLI is required. Firefox cookie access requires Node.js 22.5+ or `sqlite3` on `PATH`.
- **Classification behavior:** The app invokes Field Theory's native category-and-domain classifier in a background child process. It uses Field Theory's saved engine selection unless `FT_CLASSIFY_ENGINE=codex|claude` is set. Field Theory commits each successful batch to its SQLite database and refreshes the viewer export; a failed/interrupted run can retain completed batches. Existing Zegion staged-run files remain readable as history only.

The experimental Zegion classifier providers remain in `lib/classify/` for historical evaluation/tests only and are not wired to the production Classify action.

## Integration: Browser (Firefox primary; Chrome/Edge/Brave code paths)

- **Purpose:** Auto cookie discovery for sync.
- **Consumption:** `ft sync --browser <browser>`.
- **Current status:** Firefox profile discovery and runtime prerequisites are checked in code. A live extraction/authentication test requires a signed-in local Firefox session; Chromium automatic extraction remains environment/version dependent and is not claimed verified here.

## Non-integrations (intentionally absent)

- No cloud database, no auth provider, no telemetry, no CDN.
