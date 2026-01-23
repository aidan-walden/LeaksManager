# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Note: `microservice-py/` is deprecated** - all metadata extraction/writing functionality has been migrated to Go.

## Project Overview

Leaks Manager is a desktop application for managing music leaks and audio metadata, built with **Wails v2** (Go backend + SvelteKit frontend).

## Architecture

### Backend (Go)
- **Entry Point**: `main.go` initializes Wails app, embeds `svelte/build` assets
- **Core App**: `backend/app.go` contains the main application logic with SQLite database access
- **Domain Layer**: Organized into separate files by domain:
  - `models.go` - All type definitions and structs
  - `songs.go` - Song CRUD operations
  - `albums.go` - Album CRUD operations
  - `artists.go` - Artist CRUD operations
  - `producers.go` - Producer CRUD and alias matching
  - `metadata.go` - Audio metadata extraction/writing (ID3, Vorbis, MP4)
  - `workflows.go` - Complex multi-step operations (upload & extract, create with metadata)
  - `files.go` - File upload and storage
  - `data.go` - Initial data loading for frontend
  - `settings.go` - Application settings
  - `apple_music.go` - Apple Music library integration (macOS only)
  - `utils.go` - Helper functions (artist parsing, etc.)

### Database Migrations
- **Tool**: golang-migrate (embedded in Go binary)
- **Location**: `backend/migrations/*.sql`
- **Execution**: Migrations run automatically on app startup
- **Format**: Versioned SQL files (up/down pairs)
- **Tracking**: golang-migrate creates `schema_migrations` table to track version

**Adding new migrations:**
1. Create numbered migration files: `backend/migrations/000002_description.up.sql` and `.down.sql`
2. Write SQL in up file (forward migration)
3. Write SQL in down file (rollback migration)
4. Restart app - migration runs automatically

### Frontend (SvelteKit)
- **Location**: `svelte/` directory
- **Framework**: Svelte 5 with Runes (SPA mode, `ssr = false`)
- **UI**: shadcn-svelte components (TailwindCSS) via jsrepo
- **Wails Integration**: Auto-generated bindings in `src/lib/wails/` provide TypeScript access to Go methods
- **Routes**: Main interface at `src/routes/[tab]/` with dynamic tab routing

### Data Model
- Songs belong to one album (nullable)
- Songs/Albums have many-to-many with Artists (ordered via junction tables)
- Songs have many-to-many with Producers (ordered via junction table)
- Artwork inheritance: Songs inherit album artwork if none specified
- Producer aliases support artist-specific matching (e.g., "Metro" → "Metro Boomin" only for certain artists)

### Legacy
- **`microservice-py/`**: DEPRECATED Python/FastAPI service - do not use or modify

## Key Commands

### Development
```bash
# Start Wails dev server (Go backend + SvelteKit frontend with hot-reload)
pnpm wails:dev
# or
wails dev

# Frontend only (for UI work without rebuilding Go)
cd svelte && pnpm dev

# Type checking
cd svelte && pnpm check
```

### Building
```bash
# Build for current platform (output: build/bin/)
pnpm wails:build

# Platform-specific builds
pnpm wails:build:darwin     # macOS universal binary
pnpm wails:build:windows    # Windows amd64

# Check Wails setup
pnpm wails:doctor
```

### Frontend
```bash
cd svelte
pnpm format        # Format with Prettier
pnpm lint          # Check formatting
```

## Development Patterns

### Frontend-Backend Communication
- Frontend calls Go methods defined in `backend/app.go`
- Methods automatically exposed via Wails bindings at `window.go.backend.App.*`
- TypeScript types generated in `svelte/src/lib/wails/wailsjs/go/backend/App.d.ts`
- Models auto-generated in `svelte/src/lib/wails/wailsjs/go/models.ts`

### Metadata Extraction Workflow
1. **Upload & Extract**: `UploadAndExtractMetadata(files, albumID?)`
   - Saves files to `uploads/songs/`
   - Extracts metadata using native Go libraries (ID3v2, Vorbis, MP4 atoms)
   - Parses artist strings using `ParseArtists()` (handles feat., ft., &, commas)
   - Returns unmapped artists/albums and extracted metadata
2. **Artist/Album Mapping**: Frontend presents choices
   - User maps unmapped artists to existing or "CREATE_NEW"
   - Mapping: `map[string]any` where value is artist ID or "CREATE_NEW"
3. **Song Creation**: `CreateSongsWithMetadata(input)`
   - Creates new artists as needed
   - Associates songs with albums
   - Handles artwork (embedded or inherited from album)
   - Matches producers from filename via `MatchProducersFromFilename()`
   - Writes metadata back to files via `WriteSongMetadata(songID)`

### Database Paths
- **Development**: `svelte/local.db` (relative path)
- **Production**: User data directory
  - macOS: `~/Library/Application Support/leaks-manager/`
  - Windows: `%APPDATA%/leaks-manager/`
  - Linux: `~/.local/share/leaks-manager/`

### File Storage
- Songs: `uploads/songs/` (relative to database path)
- Artwork: `uploads/artwork/` (relative to database path)

### Artist Parsing
- `ParseArtists()` in `backend/utils.go` splits artist strings
- Handles: commas, `&`, `feat.`, `ft.`, `featuring`, semicolons
- Returns deduplicated array of trimmed artist names

### Producer Alias Matching
- Producers can have multiple aliases with optional artist restrictions
- `MatchProducersFromFilename()` finds producers in filename using aliases
- Case-insensitive matching
- Returns producer IDs for song association

## Code Conventions

### Go Backend
- Use direct SQL queries with `database/sql` package
- Custom SQLite driver registered with `LOWER()` function for case-insensitive comparisons supporting unicode
- All methods on `*App` struct can be called from frontend
- Return `(result, error)` - Wails handles error serialization

### Svelte Frontend
- **Import Alias**: `$lib/` for SvelteKit imports
- **Validation**: Zod schemas in `src/lib/schema/` (validate before sending to backend)
- **jsrepo**: Check `.cursor/rules/shadcn-svelte-extras.mdc` before creating UI components
  - Prefer existing components from `@ieedan/shadcn-svelte-extras`
  - Use pinned version from `jsrepo.json` when fetching
- **Styling**: TailwindCSS v4, use shadcn-svelte patterns
- **State**: Contexts in `src/lib/contexts/` for global state
- **Comments**: Lowercase, no JSDoc, keep concise

### General
- TypeScript only (no untyped JavaScript)
- Minimize logging
- Keep comments short and lowercase
