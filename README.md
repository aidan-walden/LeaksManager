# Leaks Manager

Desktop app for managing music leaks and supporting metadata

Infra:
- Go + Wails v2 backend
- SvelteKit (Svelte 5) frontend
- SQLite database with embedded migrations

## Features

- Manage songs, albums, artists, and producers
- Ordered many-to-many relationships (song artists, album artists, song producers)
- Metadata extraction on upload with artist parsing and mapping flow
- Metadata writing back to audio files
- Producer alias matching from filenames (with optional artist-specific alias rules)
- Artwork handling with album-to-song inheritance
- Planned: Optional Apple Music sync (macOS only)

## Requirements

- Go `1.25+`
- Node.js `20+`
- pnpm `9+`
- Wails CLI v2

Install Wails CLI, needed for compiling

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

## Deployment

Install dependencies:

```bash
pnpm install
```

Run the desktop app in development mode

```bash
pnpm wails:dev
# or
wails dev
```

## Database and Storage

- Migrations are stored in `backend/migrations/*.sql`

Data location:
- Development DB: `svelte/local.db`
- Production DB:
  - macOS: `~/Library/Application Support/leaks-manager/local.db`
  - Windows: `~/AppData/Roaming/leaks-manager/local.db`
  - Linux: `~/.local/share/leaks-manager/local.db`

Uploaded files:
- Songs: `uploads/songs/`
- Artwork: `uploads/artwork/`

Both upload folders are created automatically

## Metadata Workflow

Primary workflow methods are in `backend/workflows.go`:

1. `UploadAndExtractMetadata(files, albumID?)`
- Saves uploaded files
- Extracts metadata
- Parses artists
- Returns unmapped artists and extracted data

2. User maps artists in frontend

3. `CreateSongsWithMetadata(input)`
- Creates artists when requested
- Associates songs/albums/artwork
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
├── main.go                    # Wails entrypoint
├── backend/
│   ├── app.go                 # app startup, DB init, migrations
│   ├── models.go              # domain models and DTOs
│   ├── songs.go               # song CRUD
│   ├── albums.go              # album CRUD
│   ├── artists.go             # artist CRUD
│   ├── producers.go           # producer CRUD + aliases
│   ├── metadata.go            # metadata extract/write
│   ├── workflows.go           # upload + create workflows
│   ├── files.go               # file/artwork storage helpers
│   ├── data.go                # initial payload for frontend
│   ├── settings.go            # app settings
│   ├── apple_music.go         # macOS Apple Music integration
│   └── migrations/            # SQL migrations
└── svelte/                    # SvelteKit frontend
```

## Adding a Migration

1. Add numbered files in `backend/migrations/` like:
- `00000x_name.up.sql`
- `00000x_name.down.sql`
2. Put forward SQL in `.up.sql`
3. Put rollback SQL in `.down.sql`
4. Restart