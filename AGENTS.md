# AGENTS.md

## What This Is

Leaks Manager is an **Electron desktop app**: a TypeScript Electron main process (`electron/`) with a SvelteKit/Svelte 5 renderer (`svelte/`) and an embedded SQLite database. It manages songs, albums, artists, and producers, reads/writes audio metadata, stores uploaded audio/artwork, and can sync to Apple Music on macOS.

## Commands

Run all commands from the repo root unless noted.

```bash
pnpm install              # install workspace deps
pnpm dev:app              # run SvelteKit + Electron in dev mode
pnpm package              # package the Electron app
pnpm make                 # build platform installers

pnpm test                 # Svelte vitest + Electron vitest
pnpm test:frontend        # Svelte vitest only
pnpm test:main            # Electron/main-process vitest only

cd svelte && pnpm check   # svelte-check type-check
cd svelte && pnpm lint    # prettier --check
```

## Architecture: Electron Main, Preload, Renderer

Data does not flow over HTTP. The renderer calls `window.api.MethodName(...)`, which is exposed by `electron/preload.ts` and handled in the Electron main process.

**Transport layering** (each layer wraps the one below):
1. `svelte/src/lib/ipc/bindings.ts` defines `RawIpcBindings`, the typed `window.api` surface.
2. `svelte/src/lib/services/ipc-actions.ts` provides the camelCased component-facing API, wraps raw calls with error notification, and applies side effects such as marking songs as needing Apple Music re-sync.
3. `svelte/src/lib/contexts/app-services.ts` provides the app-services context (`syncState`, `runtimeErrors`, `ipcActions`) consumed through `getAppServicesContext()`.

The PascalCase `window.api` method names mirror `electron/channels.ts` and should stay stable unless the IPC channel itself changes. When adding an exposed capability, update `electron/channels.ts`, `electron/ipc-handlers.ts`, `electron/preload.ts` if needed, `svelte/src/lib/ipc/bindings.ts`, and `svelte/src/lib/services/ipc-actions.ts`.

## Architecture: Electron Main Process

- `electron/main.ts` handles lifecycle: resolve paths, open SQLite, run migrations, register `app://` assets, register IPC, and load the renderer.
- `electron/db/` opens SQLite and runs migrations.
- `electron/domain/` contains CRUD, workflows, settings, and initial data.
- `electron/metadata.ts` and related domain write paths read and write audio metadata with Mediabunny.
- `electron/apple-music.ts` handles macOS Apple Music integration via `osascript`.
- `electron/assets.ts` and `electron/paths.ts` serve uploaded files through `app://uploads/...` with traversal guards.

Static/uploaded files are not IPC methods. The frontend stores relative paths such as `uploads/songs/123-file.mp3`; Electron resolves and serves them through the app protocol.

## Metadata Upload Workflow

The artist-mapping upload flow is two-phase by design:
1. `UploadAndExtractMetadata(files, albumID?)` saves files, extracts metadata, parses artist strings, and returns unmapped artists.
2. The frontend collects mapping decisions.
3. `CreateSongsWithMetadata(input)` resolves/creates artists, applies album/artwork inheritance, matches producers from filename, creates songs, and writes metadata back.

`UploadSongs` is the simpler one-shot path. Metadata is handled by Mediabunny. Supported metadata writing targets are MP3, FLAC, M4A, and OGG/Vorbis.

## Database & Migrations

SQLite schema migrations live in `electron/migrations/*.sql`. Dev startup reads them from the repo; packaged apps read the copied resource at `process.resourcesPath/migrations`. The migration runner preserves the existing single-row `schema_migrations` contract.

Core tables include `songs`, `albums`, `artists`, `producers`, `producer_aliases`, `settings`, and ordered many-to-many junctions such as `song_artists`, `album_artists`, `song_producers`, and `producer_alias_artists`.

Migration `000002_sync_triggers` resets `synced = 0` when relevant metadata changes. Keep that invariant in mind when editing metadata-affecting columns.

To add a migration, create matching `00000N_name.up.sql` and `00000N_name.down.sql` files in `electron/migrations/`, then restart the app.

## Frontend

- Svelte 5 (runes), SvelteKit with `adapter-static`, SSR disabled under `svelte/src/routes/`.
- Routing is tab-based under `routes/[tab]/`; entity views live in `lib/components/inner-view/`.
- Per-entity Svelte contexts in `lib/contexts/` act as caches; `lib/stores/sync.svelte.ts` tracks Apple Music sync state.
- UI uses shadcn-svelte-extras (jsrepo) + Tailwind v4. Prefer an existing component from `@ieedan/shadcn-svelte-extras` via jsrepo before hand-writing a new one.
- Domain helpers worth knowing: `lib/utils/artist-parser.ts` and producer alias matching mirror Electron main-process logic. Keep them consistent.

## Conventions

- Tests are colocated as `*.test.ts` and use real in-memory/temp SQLite where useful.
- Run `pnpm test` before considering Electron+frontend changes done, and `cd svelte && pnpm check` for renderer type changes.
- When changing an IPC method signature, propagate through `electron/channels.ts` and handlers, `svelte/src/lib/ipc/bindings.ts`, `ipc-actions.ts`, and all call sites.
