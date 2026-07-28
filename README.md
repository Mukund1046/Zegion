# Kairos — X Bookmarks Browser

A local-first browser for exported X (Twitter) bookmarks. Browse visually in Media or Cards layouts, filter by folders/categories/domains/authors, and search with instant results.

Built on [fieldtheory-cli](https://github.com/afar1/fieldtheory-cli) for bookmark syncing and classification.

## Features

- **Media view** — image-first masonry grid for fast visual scanning
- **Cards view** — compact cards with tweet text, author, engagement counts, and timeline metadata
- **Lightbox** — full-size preview with smooth spring animation, keyboard navigation (Esc), and click-to-close
- **Folder filtering** — browse by X bookmark folders (synced via X internal GraphQL)
- **Category filtering** — classify bookmarks via fieldtheory regex classification
- **Linked domain & author facets** — filter by external domains or tweet authors
- **Full-text search** — search across tweet text, author names, and handles with clear button and stats badge
- **Sort** — Most recent, Oldest first, Most liked with icon-based dropdown
- **Dark mode** — segmented sun/moon toggle with smooth theme transition
- **Sidebar drawer** — overlay panel with collapsible sections for all filter dimensions
- **State preservation** — dark mode, active folder, view, sort, search, facet, sidebar state, and section collapses all persist across reloads via `localStorage`
- **Smooth scroll** — native smooth scroll-to-top on folder/view/facet changes
- **Thin scrollbar** — theme-aware 5px scrollbar
- **Compact toolbar** — medium-short (34px) controls in a consolidated 2-row layout
- **Responsive** — adapts to mobile and narrow viewports
- **Low-spec friendly** — smaller DOM pool and render buffer on devices with ≤4GB RAM or ≤4 cores

## Requirements

- Windows, macOS, or Linux
- Node.js 20+
- Firefox (or any browser) logged into `https://x.com` (for cookie extraction)
- `fieldtheory` CLI installed globally

## Quick start

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
```

### 3. Sync bookmark folders (optional)

```bash
npm run sync:folders
```

Fetches your X bookmark folders and writes `folders-data.json`. If you don't use folders, skip this step.

### 4. Export for the viewer

```bash
npm run export:bookmarks
```

Reads `bookmarks.jsonl`, merges folder data and fieldtheory category/domain classification, and writes `bookmarks-data.json`.

### 5. Start the viewer

```bash
npm start
```

Open `http://localhost:3000`.

## Commands

| Command | Description |
|---|---|
| `npm run sync:folders` | Fetch folder metadata from X using `X_CT0` and `X_AUTH_TOKEN` |
| `npm run export:bookmarks` | Build `bookmarks-data.json` from `bookmarks.jsonl` and optional folder/classification data |
| `npm start` | Start the local HTTP server on `localhost:3000` |
| `node server.js` | Equivalent to `npm start` |

## View modes

### Media
Image-first masonry grid. Best for fast visual scanning. Click any card to open the lightbox.

### Cards
Compact metadata-rich cards showing image thumbnail (when available), author, handle, tweet text, engagement counts, and timeline dates (Posted / Saved / Synced).

## Classification

Field Theory powers category and linked-domain classification. On Windows, avoid plain `ft` in PowerShell because it conflicts with the built-in `Format-Table` alias. Use `npx ft`, `fieldtheory`, `ft.cmd`, or the local Node entrypoint.

Recommended local workflow from this app directory:

```powershell
node node_modules\fieldtheory\bin\ft.mjs classify --engine codex
node node_modules\fieldtheory\bin\ft.mjs classify-domains --engine codex
node lib\export-bookmarks.js
```

The local Field Theory install is patched for Windows so the Codex engine launches through the npm-installed Codex JavaScript entrypoint instead of spawning the extensionless `codex` shim directly. Without that patch, Node can fail with `spawnSync codex EPERM` even when `codex --version` works in PowerShell.

If dependencies are reinstalled and the error returns, patch `node_modules\fieldtheory\dist\engine.js` so the Codex engine uses:

```text
bin: process.execPath
args prefix: C:\Users\hp\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js
```

Then rerun the workflow above and verify `data\output\bookmarks-data.json` with:

```powershell
node -e "const d=require('./data/output/bookmarks-data.json'); const cats={}; d.bookmarks.forEach(b=>{const c=b.category||'unclassified'; cats[c]=(cats[c]||0)+1}); console.log('Categories:', cats)"
```

## Project structure

```
├── app.js                 # Main UI logic (lightbox, scroll, sidebar, search, sort)
├── style.css              # All component styling
├── index.html             # HTML structure
├── server.js              # HTTP server with sync/reindex endpoints
├── export-bookmarks.js    # Exports JSONL + ft list categories to bookmarks-data.json
├── sync-folders.js        # Fetches X bookmark folders
├── config.js              # Shared .env and path resolution
├── bookmarks/             # Field Theory bookmark archives (gitignored)
├── bookmarks-data.json    # Generated UI data (gitignored)
├── folders-data.json      # Generated folder mapping (gitignored)
├── output/                # Alternative output directory (gitignored)
└── assets/                # Static assets
```

## State preservation

The following state is saved to `localStorage` under key `kairos_state` and restored on reload:

- Dark mode toggle
- Active folder
- Active view (Media / Cards)
- Sort order
- Search text
- Active facet type and value
- Sidebar open/closed
- Sidebar section collapsed/expanded states

## Troubleshooting

### `Missing X_CT0` or `Missing X_AUTH_TOKEN`
Your `.env` is missing one or both values.

### `403` / `401` during `npm run sync:folders`
Cookies are stale, swapped, or X logged you out. Re-copy from browser DevTools.

### `Found 0 folders`
Either your account doesn't use bookmark folders, or X's GraphQL response shape changed.

### `Bookmarks JSONL not found`
Set `FT_DATA_DIR` or `X_BOOKMARKS_JSONL` in `.env` pointing to your fieldtheory bookmarks location.

## Safe Git usage

Do not commit:

- `.env`
- `bookmarks/`
- `bookmarks-data.json`
- `folders-data.json`
- `output/`

These are already in `.gitignore`.

## License

MIT
