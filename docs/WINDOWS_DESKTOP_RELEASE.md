# Windows desktop release (initial Electron slice)

The desktop host wraps the existing Next.js app; it does not replace the feed
renderer. The host starts the app on an ephemeral `127.0.0.1` port and keeps
the renderer sandboxed with Node integration disabled. Bookmark data and
generated output are redirected to the current Windows user's Electron data
directory. Sync and classification child scripts use a separately bundled
Node executable.

## Development

Requirements: Windows x64, Node.js 22.5 or newer, and the normal project npm
dependencies installed.

```powershell
npm install
npm run desktop:dev
```

This starts Next.js in development mode and opens the Electron window. It uses
the current Node executable as the development sidecar and stores generated
build/runtime files under `.desktop/`.

## Build Windows packages

```powershell
npm run desktop:make
```

The script performs a desktop-only Next.js standalone build, stages its traced
server/static assets and the child-process runtime, then asks Electron Forge to
make Windows x64 Squirrel and ZIP artifacts under `out/make/`. The ordinary
`npm run build` and `npm start` web workflow remains unchanged.

The Node executable included in the package is copied from the release
builder's `process.execPath`; the stage manifest records its version and
SHA-256. Release automation should build on a trusted Windows image with an
official, patched Node.js distribution and retain that manifest with the
artifact.

## Still required before public release

- Run the full desktop build and test the actual installer and ZIP on a clean
  Windows user profile, including first launch, data migration, sync, and
  classification.
- Confirm image optimization/native modules in the packaged runtime; Next's
  Google-hosted fonts also make the current production build depend on font
  download access.
- Add a Zegion application icon, code signing, installer metadata, and a
  supported update/release channel.
- Audit the npm dependency tree and verify the signed release artifact.

This initial slice is not a claim that the application is release-ready; it
establishes the host and packaging path so those checks can be completed.
