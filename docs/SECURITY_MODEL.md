# SECURITY_MODEL.md

## Threat model

- **Attacker:** anyone who can reach the app's HTTP port other than the owner (e.g. someone on the same LAN, or a tunnel URL that leaked). The app is local-first and single-user, so the primary concern is accidental exposure of the owner's X session cookies and bookmark data via the network.
- **Assets:** X session cookies (`ct0`, `auth_token`), the bookmark corpus (private), the running Next.js dev/prod server.

## Authentication

- No user-facing auth flow. X authentication is **browser-derived** (Field Theory auto) or **manual paste** of cookies into Sync Settings.
- Cookies are read by child processes from env; the browser profile is read by Field Theory locally.

## Authorization

- **API routes** (`/api/*`): `requireLocalOrApiKey(request)`:
  - If `X_API_KEY` is set, a matching `x-api-key` header is required for all callers **including** localhost.
  - Otherwise, `localhost` / `127.0.0.1` / `::1` pass; anything else gets `401 Unauthorized`.
- **Pages** (`/`, `/spatial`): statically served, no auth (they read no secrets client-side; data is read-only JSON).

## Credential handling

- `X_CT0` / `X_AUTH_TOKEN` live in `.env` (git-ignored) or `cookies-config.json` (manual mode, stored next to the JSONL dir).
- They are injected into spawned child processes via `env` only — never on the command line, never logged.
- `GET /api/cookies` returns only a boolean `hasCookies` + source/browser/mode — never the cookie values.

## Encryption

- At rest: **no** encryption of stored data or cookies. This is an accepted local-first tradeoff. Cookies are protected only by OS file permissions and the git-ignore policy.
- In transit: dev server is HTTP (LAN). For remote access use a tunnel (HTTPS) — Cloudflare Tunnel / ngrok / Tailscale, or set `X_API_KEY` for keyed access.

## Local storage

- `localStorage` keys: `kairos_state` (viewer prefs), `kairos-spatial-settle` (DialKit tune). No secrets stored client-side.
- Disk: `data/`, `.env`, `cookies-config.json`, `bookmarks-meta.json` — all git-ignored.

## Secrets & git policy

- NEVER commit: `.env`, bookmark exports, generated JSON, `data/` contents, `cookies-config.json`.
- `.env.example` documents defaults only (no real cookies).
- Treat `X_CT0`/`X_AUTH_TOKEN` as secrets; re-test folder sync if X rotates session cookies.

## Network communication

- X GraphQL + Field Theory calls happen server-side in child processes, not in the browser.
- Browser only talks to the app's own API (same-origin) and X CDN image URLs.

## Data retention

- Bookmarks persist as long as the JSONL/JSON files exist. Re-running sync replaces/updates them (Field Theory manages dedup). No expiry.

## Logging

- No structured logging of secrets. `console.warn/error` for failures; child stdout/stderr only captured into error messages (sanitized before returning to the client).

## Error messages

- `sanitizeError()` in `api-auth.ts`: only whitelisted prefixes ("Please wait ", "is already running") are returned verbatim; everything else → "Unexpected server error". Prevents leaking filesystem paths or internals.

## Rate limiting

- `lib/rate-limit.ts` provides in-memory tiers (`strict` 5/min, `moderate` 30/min, `default` 60/min) keyed by client IP (`x-forwarded-for`/`x-real-ip`). Enforced by `proxy.ts` middleware for all `/api/*` routes: `/api/cookies` uses `strict`, `/api/sync`/`/api/reindex` use `moderate`, everything else `default`. Over-limit requests get `429` with `Retry-After` + `X-RateLimit-*` headers. The proxy also sets security headers (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, base CSP).

## Input validation

- `/api/cookies` POST is Zod-validated (`source` enum, `browser` enum, `ct0`/`authToken` max 1024 chars).

## Security boundaries

1. **Browser ↔ API:** same-origin; API keyed for non-localhost.
2. **Next server ↔ Child processes:** cookies via env only.
3. **Child processes ↔ X:** direct, with cookies.
4. **Disk ↔ API:** local file reads.

## Key principles

- Secrets never leave the machine except into X API calls (and only via env).
- Nothing secret is ever returned by the API.
- Remote exposure requires explicit opt-in (tunnel + key), never implicit.