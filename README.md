# Leaks Manager

Desktop app for managing music leaks and supporting metadata.

Infra:
- Electron main process backend
- SvelteKit (Svelte 5) renderer
- SQLite database with SQL migrations

## Features

- Manage songs, albums, artists, and producers
- Ordered many-to-many relationships
- Mediabunny metadata extraction on upload with artist parsing and mapping flow
- Mediabunny metadata writing back to audio files
- Producer alias matching from filenames
- Artwork handling with album-to-song inheritance
- Optional Apple Music sync on macOS

## Requirements

- Node.js `20+`
- pnpm `9+`

## Development

Install dependencies:

```bash
pnpm install
```

Run the desktop app in development mode:

```bash
pnpm dev:app
```

Run tests:

```bash
pnpm test
cd svelte && pnpm check
```

## Packaging

The Electron app is packaged with electron-forge on top of electron-vite and the SvelteKit static build. Output lands in `dist-forge/`.

```bash
pnpm package    # .app only, no installers
pnpm make       # macOS: builds .app + .zip + .dmg
```

Notes:
- Use Node 20/22 LTS to run `pnpm make` or `pnpm package`.
- Only macOS makers build on a Mac. Other platform makers must run on their own host or CI.
- `better-sqlite3` is rebuilt for Electron during packaging. Run `pnpm rebuild better-sqlite3` before standalone Electron tests if needed.

## Database and Storage

- Migrations are stored in `electron/migrations/*.sql`.

Data location:
- Development DB: `svelte/local.db`
- Production DB:
  - macOS: `~/Library/Application Support/leaks-manager/local.db`
  - Windows: `~/AppData/Roaming/leaks-manager/local.db`
  - Linux: `~/.local/share/leaks-manager/local.db`

Uploaded files:
- Songs: `uploads/songs/`
- Artwork: `uploads/artwork/`

Both upload folders are created automatically.

## Metadata Workflow

Primary workflow methods are in `electron/domain/workflows.ts`:

1. `UploadAndExtractMetadata(files, albumID?)`
- Saves uploaded files
- Extracts metadata
- Parses artists
- Returns unmapped artists and extracted data

2. User maps artists in the renderer.

3. `CreateSongsWithMetadata(input)`
- Creates artists when requested
- Associates songs, albums, and artwork
- Matches producers from filename
- Writes metadata back to each file

Supported metadata writing target file formats:
- MP3
- FLAC
- M4A
- OGG/Vorbis

## Project Structure

```text
.
├── electron/
│   ├── main.ts                # Electron lifecycle, DB, IPC, app protocol
│   ├── preload.ts             # exposes window.api
│   ├── channels.ts            # IPC channel map
│   ├── ipc-handlers.ts        # IPC handler map
│   ├── domain/                # CRUD, workflows, settings, initial data
│   ├── db/                    # SQLite connection and migrations runner
│   └── migrations/            # SQL migrations
└── svelte/                    # SvelteKit renderer
```

## Adding a Migration

1. Add numbered files in `electron/migrations/`:
- `00000x_name.up.sql`
- `00000x_name.down.sql`
2. Put forward SQL in `.up.sql`.
3. Put rollback SQL in `.down.sql`.
4. Restart the app.
