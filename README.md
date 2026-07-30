<div align="center">
  <picture>
    <img src="assets/Logo/ZegionforReadme.png" alt="Zegion logo" width="300">
  </picture>
</div>

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![fieldtheory](https://img.shields.io/badge/powered%20by-fieldtheory-blueviolet)](https://github.com/afar1/fieldtheory-cli)

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
NEXT_PUBLIC_X_API_KEY=your_api_key_here
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
| **UI primitives** | [Base UI](https://base-ui.com) (Radix), [Dial Kit](https://dialkit.dev) |
| **Icons** | [Hugeicons](https://hugeicons.com), [Lucide](https://lucide.dev) |
| **Bookmark sync** | [fieldtheory-cli](https://github.com/afar1/fieldtheory-cli) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com) + CSS custom properties |
| **State** | React hooks + `localStorage` persistence |

---

## 🛡️ License

Released under the [MIT License](LICENSE).
