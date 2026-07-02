# AGENTS.md

## What this is

Leaks Manager is a **Wails v2 desktop app**: a Go backend (`backend/`) bound to a SvelteKit/Svelte 5 frontend (`svelte/`), with an embedded SQLite database. It manages music files — songs, albums, artists, producers — extracts/writes audio metadata, and optionally syncs to Apple Music on macOS.

## Commands

Run all commands from the repo root unless noted.

```bash
pnpm install              # install frontend deps (pnpm workspace)
pnpm wails:dev            # run the desktop app in dev mode (hot reload, dev DB)
wails build               # production build; macOS: pnpm wails:build:darwin

pnpm test                 # frontend (vitest) + backend (go test) together
pnpm test:backend         # go test ./backend/...
pnpm test:frontend        # vitest run

# single tests
go test ./backend/ -run TestName -v
cd svelte && pnpm vitest run src/lib/utils/artist-parser.test.ts

cd svelte && pnpm check   # svelte-check (type-check); pnpm lint = prettier --check
```

Note: the backend uses `mattn/go-sqlite3`, so **CGO is required** to build/test the backend (a C compiler must be available).

## Architecture: the Go↔Svelte bridge

This is the single most important thing to understand. Data does not flow over HTTP — it crosses the Wails boundary as direct method calls.

**Backend → exposed API.** Public methods on `backend.App` (the struct bound in `main.go` via `Bind`) are automatically exposed to JS as `window.go.backend.App.MethodName(...)`. Adding a new backend capability means adding a method on `*App`. Wails regenerates JS bindings under `svelte/src/lib/wails/wailsjs/` (configured by `wailsjsdir` in `wails.json`) during `wails dev`/`build`.

**Frontend transport layering** (each layer wraps the one below — when adding an exposed method, update all of these):
1. `svelte/src/lib/wails/bindings.ts` — `RawWailsAppBindings` types the Electron preload `window.api` surface.
2. `svelte/src/lib/services/wails-actions.ts` — provides the camelCased component-facing API, wraps raw calls with error notification, and applies side effects (e.g. marking songs as needing Apple Music re-sync).
3. `svelte/src/lib/contexts/app-services.ts` — provides the single app-services context (`syncState`, `runtimeErrors`, `wailsActions`) consumed by components via `getAppServicesContext()`. Per-entity contexts like `albums-context` remain separate caches.

**Static/uploaded files** are NOT bound methods. Uploaded audio/artwork is served over an asset-server middleware (`backend/upload_asset_handler.go`, `CreateUploadsMiddleware`) at `/uploads/...`, with path-traversal guards. The frontend references files by relative path (e.g. `uploads/songs/123-foo.mp3`).

## Architecture: backend

- `app.go` — `App` struct, `Startup`/`Shutdown` lifecycle, SQLite open, embedded migration runner. Case-insensitive lookups use SQLite `COLLATE NOCASE`.
- `paths.go` — **dev vs prod path resolution.** Dev mode (detected via Wails env vars or presence of `wails.json`+`svelte/`) uses `svelte/local.db` and `svelte/` as static root. Prod uses the OS user-data dir (e.g. `~/Library/Application Support/leaks-manager/`). All upload paths are normalized and traversal-checked here.
- `models.go` — domain models and the DTOs (`*Input`, `*Result`) that cross the bridge.
- CRUD files: `songs.go`, `albums.go`, `artists.go`, `producers.go`, `settings.go`. `db.go` provides `InTx` for transactional work.
- `workflows.go` — the **multi-step upload/create flows** (see below).
- `metadata.go` + adapters — metadata read/write (see below).
- `apple_music.go` — macOS-only Apple Music sync driven by AppleScript (`osascript`); no-ops on other platforms and when the setting is disabled.

### Metadata adapter pattern

`metadata.go` defines `SongTags` (cross-format tag payload) and the `MetadataWriter` interface (`Read`/`Write`). `pickAdapter(ext)` routes by file extension to format-specific adapters:
- `metadata_id3.go` (MP3), `metadata_mp4.go` (M4A/MP4), `metadata_vorbis.go` (FLAC, OGG/Vorbis).

Reads for extraction use `dhowden/tag` (handles all formats); **writes** go through the adapters. `buildSongTags(songID)` assembles tags from the DB, applying inheritance rules (song falls back to album for genre/artwork/album-artist) and singles/track-number logic driven by `Settings`. When adding a format, implement a new adapter and register it in `pickAdapter`.

### Metadata upload workflow (`workflows.go`)

The artist-mapping flow is two-phase by design (frontend sits in the middle):
1. `UploadAndExtractMetadata(files, albumID?)` — saves files, extracts metadata, parses artist strings, returns which artists are **unmapped** (don't exist yet).
2. Frontend collects user decisions (map to existing artist vs. create new).
3. `CreateSongsWithMetadata(input)` — resolves/creates artists, applies album/artwork inheritance, matches producers from filename, creates songs, and writes metadata back to each file.

`UploadSongs` is the simpler one-shot path (no mapping UI).

### Database & migrations

SQLite schema lives in `backend/migrations/*.sql`, embedded via `go:embed` and run on startup with `golang-migrate`. Core tables: `songs`, `albums`, `artists`, `producers`, `producer_aliases`, `settings`, plus ordered many-to-many junctions (`song_artists`, `album_artists`, `song_producers`, `producer_alias_artists`) — note the `"order"` column for ordered relationships.

**Sync tracking via triggers:** migration `000002_sync_triggers` defines triggers that reset `synced = 0` on rows when relevant metadata changes, so the Apple Music sync knows what's dirty. Editing metadata-affecting columns should keep this invariant in mind.

To add a migration: create `00000N_name.up.sql` and `00000N_name.down.sql` in `backend/migrations/`, then restart the app.

## Architecture: frontend

- Svelte 5 (runes), SvelteKit with `adapter-static`, **SSR disabled** (`svelte/src/routes/[tab]/+page.ts` / `+layout.ts`) — it's a client-rendered SPA embedded in Wails.
- Routing is tab-based under `routes/[tab]/`; entity views live in `lib/components/inner-view/` (songs/albums/artists/producers tabs).
- State: per-entity Svelte contexts in `lib/contexts/` act as caches; `lib/stores/sync.svelte.ts` tracks Apple Music sync state. Use `getAppServicesContext()` to reach backend actions from components.
- UI uses shadcn-svelte-extras (jsrepo) + Tailwind v4. Per `.cursor/rules/`: **prefer pulling an existing component from `@ieedan/shadcn-svelte-extras` via jsrepo** (respecting the pinned version in `svelte/jsrepo.json`) before hand-writing a new one.
- Domain helpers worth knowing: `lib/utils/artist-parser.ts` (splits combined artist strings) and producer alias matching mirror backend logic — keep them consistent.

## Conventions

- Tests are colocated (`*_test.go`, `*.test.ts`) and use a real in-memory/temp SQLite on the Go side. Run the full `pnpm test` before considering backend+frontend changes done.
- When changing a bound backend method's signature, propagate through `bindings.ts` → `wails-actions.ts` → contexts/components; type-check with `cd svelte && pnpm check`.
- Supported audio formats for metadata writing: MP3, FLAC, M4A, OGG/Vorbis.
