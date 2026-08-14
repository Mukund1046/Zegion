<div align="center">
  <picture>
    <img src="assets/Logo/ZegionforReadme.png" alt="Zegion logo" width="300">
  </picture>
</div>

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![license](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![fieldtheory](https://img.shields.io/badge/Powered%20by-Fieldtheory-blueviolet)](https://github.com/afar1/fieldtheory-cli)

**Runs on macOS · Linux · Windows**

</div>

**Zegion** is a local-first browser for your X (Twitter) bookmarks. It renders bookmarks in a fluid, keyboard-driven interface with Media and Cards layouts, folder/category/author/domain filtering, full-text search with tag prefixes, a spring-animated lightbox, and dark mode — all running entirely on your machine.

Bookmarks are synced via [fieldtheory-cli](https://github.com/afar1/fieldtheory-cli) and optionally classified by category and linked domain using its regex or LLM engine.

---

## 📑 Table of Contents

- [Features](#-features)
- [Requirements](#-requirements)
- [Quick Start](#-quick-start)
- [Commands](#-commands)
- [View Modes](#-view-modes)
- [Spatial Prototype](#-spatial-prototype)
- [Agent Continuity Pack](#-agent-continuity-pack)
- [Remote Access](#-remote-access)
- [Classification](#-classification)
- [Project Structure](#-project-structure)
- [State Preservation](#-state-preservation)
- [Troubleshooting](#-troubleshooting)
- [Built With](#-built-with)
- [License](#-license)

---

## 🛠️ Features

- **Media view** — image-first masonry grid for fast visual scanning
- **Cards view** — compact cards with tweet text, author, engagement counts, and timeline metadata
- **Lightbox** — full-size preview with smooth spring animation, keyboard navigation (Esc), and backdrop blur
- **Folder filtering** — browse by X bookmark folders (synced via X internal GraphQL)
- **Category & domain filtering** — filter by fieldtheory classification or linked external domains
- **Author facet** — filter by tweet author with count badges
- **Full-text search** — search across tweet text, authors, and handles with `@author`, `#category`, and `domain:` tag prefixes
- **Instant tag results** — inline author, category, and domain suggestions as you type
- **Sort picker** — Most recent, Oldest first, Most liked with icon-based dial
- **Dark mode** — persistent theme toggle with smooth transition
- **Keyboard shortcuts** — `⌘K` / `Ctrl+K` to open search, `Esc` to close lightbox
- **Sidebar drawer** — overlay panel with collapsible sections for all filter dimensions
- **State persistence** — folder, view, sort, search, facet, sidebar, and section collapses survive reload via `localStorage`
- **Responsive** — adapts to mobile and narrow viewports
- **Low-spec friendly** — smaller DOM pool and render buffer on devices with ≤4 GB RAM or ≤4 cores
- **Token-aware sync** — multi-browser cookie config (auto-detect Firefox/Edge/Chrome/Brave, or manual)
- **Re-indexing** — rebuild the local bookmark index from JSONL without re-syncing from X

---

## 📋 Requirements

- Windows, macOS, or Linux
- Node.js 20+
- A browser logged into `https://x.com` (for cookie extraction)
- `fieldtheory` CLI installed globally

---

## 🚦 Quick Start

```bash
git clone <repo-url> kairos
cd kairos
npm install
npm install -g fieldtheory
```

### 1. Sync your bookmarks with Field Theory

```bash
fieldtheory sync
```

This downloads your X bookmarks into Field Theory's data directory as `bookmarks.jsonl`.

### 2. Configure cookies

```bash
cp .env.example .env
```

Open `.env` and set your X cookies. Get them from browser DevTools → Cookies for `https://x.com`:

```env
X_CT0=your_ct0_here
X_AUTH_TOKEN=your_auth_token_here
X_API_KEY=your_api_key_here
```

### 3. Sync bookmark folders (optional)

```bash
node lib/sync-folders.js
```

Fetches your X bookmark folders and writes `folders-data.json`. If you don't use folders, skip this step.

### 4. Export for the viewer

```bash
node lib/export-bookmarks.js
```

Reads `bookmarks.jsonl`, merges folder data and fieldtheory classification/domain data, and writes `bookmarks-data.json`.

### 5. Start the viewer

```bash
npm run dev
```

Open **http://localhost:3001** in your browser.

---

## 📟 Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Next.js dev server on port 3001 |
| `npm run build` | Production build |
| `npm start` | Start the production server on port 3001 |
| `node lib/sync-folders.js` | Fetch folder metadata from X using `X_CT0` and `X_AUTH_TOKEN` |
| `node lib/export-bookmarks.js` | Build `bookmarks-data.json` from `bookmarks.jsonl` and optional folder/classification data |
| `node node_modules/fieldtheory/bin/ft.mjs classify --engine codex` | Run category classification |
| `node node_modules/fieldtheory/bin/ft.mjs classify-domains --engine codex` | Run domain classification |

---

## 🎨 View Modes

### Media

Image-first masonry grid. Best for fast visual scanning. Click any card to open the lightbox with a smooth spring animation, backdrop blur, and info overlay.

### Cards

Compact metadata-rich cards showing image thumbnail (when available), author, handle, tweet text, engagement counts, and timeline dates (Posted / Saved / Synced).

---

## 🔬 Spatial Prototype

A research prototype at **`/spatial`** explores a canvas-style reading model: infinite zoom, compositor-only fluid zoom (magnifier), continuous camera motion, a single post-gesture settle, image LOD buckets, a minimap, and live motion tuning. It is **not** a shipped view mode. To try it:

```bash
npm run dev
# open http://localhost:3001/spatial
```

- Scroll / trackpad — pan · Ctrl+Scroll — zoom
- `−` / `+` — cursor-anchored step zoom · `Fit` — frame the whole world · `1:1` · `Reset`
- Click the minimap to jump
- `?wz=1` — one world-container transform instead of per-card writes
- `?zinstant=1` — disable continuous fluid zoom (A/B baseline)
- `?profile` / `Shift+P` — Kairos profiler
- `?probe` — expose `window.__spatialProbe.engine` for external verification scripts

See `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (D-01…D-06), and `.agent/` for the engine's invariants and known tradeoffs.

---

## 📚 Agent Continuity Pack

Layered docs for agents and maintainers (see `README` structure note in `AGENTS.md`):

| File | Contents |
|---|---|
| `AGENTS.md` | Agent behavior, repo rules, commands |
| `docs/PROJECT_STATE.md` | Why/what/who; implemented vs not; subsystems |
| `docs/ARCHITECTURE.md` | Component-level architecture |
| `docs/DECISIONS.md` | ADR-style decision log (D-01…D-17) |
| `docs/SYSTEM_MAP.md` | System graph + data flows |
| `docs/DOMAIN_MODEL.md` | Entities & relationships |
| `docs/INTEGRATIONS.md` | X / Field Theory / Codex |
| `docs/SECURITY_MODEL.md` | Threat model & controls |
| `docs/UX_SPEC.md` | UX principles & interactions |
| `docs/HISTORY.md` | Architectural evolution |
| `.agent/CURRENT_STATE.md` | Live project snapshot |
| `.agent/ACTIVE_TASK.md` | Current task status |
| `.agent/KNOWN_ISSUES.md` | Issue registry (ISSUE-001…) |
| `.agent/OPEN_QUESTIONS.md` | Unresolved questions (Q-001…) |
| `.agent/HANDOFF.md` | Agent handoff |
| `CONVERSATION_KNOWLEDGE.md` | Provenance-tracked knowledge (K-001…) |

**Bootstrap order for agents:** AGENTS.md → CURRENT_STATE.md → HANDOFF.md → PROJECT_STATE.md → SYSTEM_MAP.md → relevant ARCHITECTURE/DECISIONS sections → CONVERSATION_KNOWLEDGE.md → KNOWN_ISSUES.md → OPEN_QUESTIONS.md → source.

---

## 🌐 Remote Access

Your dev server listens on **3001** (`npm run dev`). To check it from another laptop, use a tunnel (all free):

**Cloudflare Tunnel (no account):**
```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3001
```

**ngrok:**
```powershell
winget install --id ngrok.ngrok
ngrok config add-authtoken <YOUR_TOKEN>
ngrok http 3001
```

**Tailscale (constant address, best for repeat use):**
```powershell
winget install --id Tailscale.Tailscale
tailscale up   # add both machines to the same tailnet
# other laptop: http://<your-tailscale-ip>:3001
```

**Notes:**
- Keep `npm run dev` running while testing.
- In dev, Next.js may block cross-origin dev resources for the tunnel host — add it to `allowedDevOrigins` in `next.config.ts` (dev only).
- In production, the API is guarded: for non-localhost callers set `X_API_KEY` and send it as the `x-api-key` header (see `SECURITY_MODEL.md`).
- LAN-only alternative: `npx next dev --port 3001 -H 0.0.0.0`, then use `http://<your-LAN-IP>:3001` on the same Wi-Fi.

---

## 🧠 Classification

Field Theory powers category and linked-domain classification. On Windows, avoid plain `ft` in PowerShell because it conflicts with the built-in `Format-Table` alias. Use `npx ft`, `fieldtheory`, `ft.cmd`, or the local Node entrypoint.

Recommended local workflow from this app directory:

```powershell
node node_modules\fieldtheory\bin\ft.mjs classify --engine codex
node node_modules\fieldtheory\bin\ft.mjs classify-domains --engine codex
node lib\export-bookmarks.js
```

The local Field Theory install is patched for Windows so the Codex engine launches through the npm-installed Codex entrypoint instead of spawning the extensionless `codex` shim directly. Without that patch, Node can fail with `spawnSync codex EPERM` even when `codex --version` works in PowerShell.

If dependencies are reinstalled and the error returns, patch `node_modules\fieldtheory\dist\engine.js` so the Codex engine uses:

```text
bin: process.execPath
args prefix: C:\Users\hp\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js
```

Then rerun the workflow above and verify `data\output\bookmarks-data.json` with:

```powershell
node -e "const d=require('./data/output/bookmarks-data.json'); const cats={}; d.bookmarks.forEach(b=>{const c=b.category||'unclassified'; cats[c]=(cats[c]||0)+1}); console.log('Categories:', cats)"
```

---

## 🏗️ Project Structure

```
zeleon/
├── app/                        # Next.js App Router pages and API routes
│   ├── api/                    # API endpoints (bookmarks, sync, reindex, status, cookies)
│   ├── globals.css             # All component styling
│   ├── layout.tsx              # Root layout with fonts and DialRoot
│   └── page.tsx                # Entry point
├── components/                 # React components
│   ├── BookmarksViewer.tsx     # Main viewer (toolbar, feed, search, lightbox)
│   └── ui/                    # Primitive UI components (dialog, sort-picker, drawer, etc.)
├── hooks/
│   └── useBookmarkViewer.ts    # Core viewer state, grid layout, lightbox animation
├── lib/
│   ├── api-auth.ts             # API key / localhost guard
│   ├── client-api.ts           # Fetch wrapper with API key header
│   ├── native-config.ts        # Runtime path resolution
│   ├── cookie-config.ts        # Multi-browser cookie config
│   ├── server-jobs.ts          # Sync / reindex orchestration
│   ├── export-bookmarks.js     # Bookmark JSONL → bookmarks-data.json
│   ├── sync-folders.js         # X folder GraphQL fetcher
│   └── config.js               # Shared path/env resolution for scripts
├── data/                       # Generated data (gitignored)
│   └── output/                 # bookmarks-data.json, folders-data.json
├── assets/                     # Static assets
│   └── Logo/                   # Zegion logo files
├── .env.example                # Environment variable template
├── next.config.ts              # Next.js configuration
├── package.json
└── README.md
```

---

## 💾 State Preservation

The following state is saved to `localStorage` under key `kairos_state` and restored on reload:

- Dark mode toggle
- Active folder
- Active view (Media / Cards)
- Sort order
- Search text
- Active facet type and value
- Sidebar open/closed
- Sidebar section collapsed/expanded states

---

## 🔧 Troubleshooting

### `Missing X_CT0` or `Missing X_AUTH_TOKEN`
Your `.env` is missing one or both values.

### `403` / `401` during folder sync
Cookies are stale, swapped, or X logged you out. Re-copy from browser DevTools.

### `Found 0 folders`
Either your account doesn't use bookmark folders, or X's GraphQL response shape changed.

### `Bookmarks JSONL not found`
Set `FT_DATA_DIR` or `X_BOOKMARKS_JSONL` in `.env` pointing to your fieldtheory bookmarks location.

### `Unexpected token... Internal Server...` on Sync / Re-index
The server returned an HTML error page instead of JSON, usually because the job timed out or the API endpoint crashed. Check the terminal output for the full stack trace. Make sure the Field Theory CLI is installed and the scripts in `lib/` have executable permissions.

---

## 🏗️ Built With

Zegion is a **local-first** Next.js application. No cloud service, account, or API key is required to browse your bookmarks.

| Layer | Technology |
|-------|------------|
| **Framework** | [Next.js 16](https://nextjs.org) (App Router, Turbopack) |
| **Language** | [TypeScript](https://www.typescriptlang.org) / JavaScript |
| **Runtime** | [Node.js](https://nodejs.org) |
| **Animation** | [Motion](https://motion.dev) (Framer Motion) |
| **UI primitives** | [Base UI](https://base-ui.com) (Radix), [Dial Kit](https://github.com/joshpuckett/dialkit) |
| **Icons** | [Hugeicons](https://hugeicons.com), [Lucide](https://lucide.dev) |
| **Bookmark sync** | [fieldtheory-cli](https://github.com/afar1/fieldtheory-cli) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com) + CSS custom properties |
| **State** | React hooks + `localStorage` persistence |

---

## 🛡️ License

Released under the [MIT License](LICENSE).
