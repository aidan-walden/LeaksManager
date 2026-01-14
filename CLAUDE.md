# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a music/leak management application with a **monorepo structure** containing:
- **svelte/**: SvelteKit frontend application with integrated SQLite database (Drizzle ORM)
- **microservice/**: FastAPI Python service for audio file metadata management

The application manages songs, albums, and artists with many-to-many relationships, file uploads, and audio metadata editing capabilities.

## Architecture

### Monorepo Structure
Work in the appropriate directory based on your task:
- Frontend changes, database schema, or UI: Work in `svelte/`
- Audio file metadata operations: Work in `microservice/`

### Frontend (SvelteKit in `svelte/`)

**Validation Layer (`src/lib/schema/`)**:
- `index.ts`: Zod schemas for all form validation and API contracts
- Used throughout form actions with `.safeParse()` pattern
- Schemas include: album/artist/song creation, file uploads, metadata extraction
- Microservice API request/response validation

**Database Layer (`src/lib/server/db/`)**:
- `schema.ts`: Drizzle ORM schema defining tables (songs, albums, artists, producers, junction tables)
- `helpers.ts`: Query helpers with relationship loading (e.g., `getSongWithArtists`, `getAlbumWithArtists`)
  - Producer management: `addProducersToSong`, `setSongProducers`
  - Case-insensitive lookups: `findArtistByNameCaseInsensitive`, `findAlbumByNameCaseInsensitive`, `findProducerByNameCaseInsensitive`
  - Pagination helpers: `getSongsCount`, `getAlbumsCount`, `getArtistsCount`
- `index.ts`: Database client initialization using libsql
- Uses junction tables (`album_artists`, `song_artists`, `song_producers`) for many-to-many relationships with ordering

**Routing**:
- `[tab]/+page.svelte`: Dynamic tab-based routing for songs/albums/artists views
- `+layout.server.ts`: Root loader fetches all data (songs, albums, artists) upfront
- Form actions in `[tab]/+page.server.ts` handle:
  - Basic CRUD operations (create/update/delete for songs, albums, artists)
  - File uploads (songs, artwork)
  - Complex metadata workflows (`uploadAndExtractMetadata`, `createSongsWithMetadata`)
  - File cleanup operations

**Utilities (`src/lib/utils/`)**:
- `artist-parser.ts`: `parseArtists()` function splits metadata artist strings
  - Handles delimiters: commas, ampersands, "feat.", "ft.", "featuring", semicolons
  - Returns deduplicated array of artist names
  - Used during metadata extraction to parse embedded artist tags

**Key Relationships**:
- Songs can belong to one album (nullable)
- Songs and albums have many-to-many with artists (ordered via junction tables)
- Songs have many-to-many with producers (ordered via `song_producers` junction table)
- Artwork inheritance: Songs inherit album artwork if they don't have their own

**Component Structure**:
- Uses shadcn-svelte UI components (via jsrepo)
- `app-sidebar.svelte`: Main navigation
- `inner-view.svelte`: Renders appropriate view based on active tab
- Data tables use TanStack Table Core

### Microservice (FastAPI in `microservice/`)

**Purpose**: Audio file metadata management using mutagen library
- `POST /extract-metadata`: Extracts metadata from uploaded audio files (artists, album, title, artwork, etc.)
- `POST /write-metadata/{song_id}`: Queries SQLite database, reads song with all metadata, writes ID3 tags (MP3) or Vorbis comments to the audio file
- Connects directly to `svelte/local.db` SQLite database
- Handles both ID3 (MP3) and other audio formats
- Returns structured metadata validated against Zod schemas

## Development Commands

### Frontend (run from `svelte/` directory)
```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm preview          # Preview production build
pnpm check            # Type-check
pnpm check:watch      # Type-check in watch mode
pnpm format           # Format with Prettier
pnpm lint             # Check formatting
```

### Database (run from `svelte/` directory)
```bash
pnpm db:push          # Push schema changes to database
pnpm db:generate      # Generate migrations
pnpm db:migrate       # Run migrations
pnpm db:studio        # Open Drizzle Studio GUI
```

### Microservice (run from `microservice/` directory)
```bash
# Activate virtual environment first
source venv/bin/activate  # On Unix/Mac
# or
venv\Scripts\activate     # On Windows

# Then run the service
fastapi dev main.py       # Development server with auto-reload
uvicorn main:app --reload # Alternative
```

## Important Configuration

**Environment Variables** (`svelte/.env`):
- `DATABASE_URL`: SQLite database path (default: `file:local.db`)

**jsrepo Integration**:
- UI components fetched from `@ieedan/shadcn-svelte-extras`
- Path aliases defined in `jsrepo.json`: `ui`, `actions`, `hooks`, `utils`
- Check `.cursor/rules/shadcn-svelte-extras.mdc` before creating new components

**Import Aliases**:
- `@/*` maps to `./src/lib/*` (configured in svelte.config.js)
- Use `$lib/` for SvelteKit aliasing

## Data Flow Patterns

**Metadata Extraction Workflow**:
1. **Upload & Extract**: `uploadAndExtractMetadata` form action
   - User uploads audio files
   - Files saved to `static/uploads/songs/`
   - Microservice `/extract-metadata` endpoint called to parse embedded metadata
   - Returns: artists, album, title, artwork, year, track numbers
   - Identifies unmapped artists/albums (not yet in database)
2. **Artist/Album Mapping**:
   - Frontend presents unmapped artists to user
   - User chooses: map to existing artist OR create new
   - Artist mapping object: `Record<string, number | 'CREATE_NEW'>`
   - Case-insensitive lookups used for album matching
3. **Song Creation**: `createSongsWithMetadata` form action
   - Creates new artists for any marked 'CREATE_NEW'
   - Maps parsed artists to database IDs
   - Associates songs with albums (if metadata contains album)
   - Saves embedded artwork or inherits from album
   - Creates songs with full metadata
   - Calls microservice `/write-metadata` to sync metadata back to files

**Form Validation Pattern**:
- All form actions use Zod schemas via `.safeParse(formData)`
- Check `validated.success` before proceeding
- Return validation errors with 400 status
- Schemas defined in `src/lib/schema/index.ts`

**Creating Songs with Album Context**:
1. If song belongs to album, inherit album's artwork and artists
2. Artists and artwork can be overridden at song level
3. Junction tables maintain artist order for display
4. Producers can be added via `producerIds` parameter

**Updating Relationships**:
- Use `setSongArtists` / `setAlbumArtists` / `setSongProducers` helpers (delete + recreate for simplicity)
- Order field in junction tables determines display order

**Querying with Relations**:
- Always use Drizzle's relational queries with `with` for nested data
- Helper functions in `helpers.ts` encapsulate common query patterns
- Use case-insensitive lookups when searching by name
- Avoid raw SQL unless necessary

## Tech Stack Notes

- **Svelte 5**: Uses runes (`$derived`, `$props`, `$state`) - not Svelte 4 syntax
- **Zod 4**: Used for all form validation and API contract validation
- **Drizzle ORM**: Relational query API preferred over raw SQL
- **SQLite**: Single `local.db` file, shared between frontend and microservice
- **TailwindCSS 4**: Configured via Vite plugin
- **TypeScript**: Strict mode enabled
- **FastAPI + Mutagen**: Python microservice for audio metadata operations

## File Uploads

- Songs uploaded to `static/uploads/songs/`
- Album artwork uploaded to `static/uploads/artwork/`
- Files timestamped on server: `${Date.now()}-${file.name}`
- Filepaths stored in database with `/uploads/...` prefix

## Writing Functions and Other Code

- Always adhere to TypeScript unless writing code in a Python file
- Never add jsdoc comments
- Keep comments short and in all lowercase text (ex: // push users song update to db)
- Do not add tons of logging
- Unless explicitly prompted, never run things yourself