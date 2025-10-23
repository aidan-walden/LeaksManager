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

**Database Layer (`src/lib/server/db/`)**:
- `schema.ts`: Drizzle ORM schema defining tables (songs, albums, artists, junction tables)
- `helpers.ts`: Query helpers with relationship loading (e.g., `getSongWithArtists`, `getAlbumWithArtists`)
- `index.ts`: Database client initialization using libsql
- Uses junction tables (`album_artists`, `song_artists`) for many-to-many relationships with ordering

**Routing**:
- `[tab]/+page.svelte`: Dynamic tab-based routing for songs/albums/artists views
- `+layout.server.ts`: Root loader fetches all data (songs, albums, artists) upfront
- Form actions in `[tab]/+page.server.ts` handle CRUD operations

**Key Relationships**:
- Songs can belong to one album (nullable)
- Songs and albums have many-to-many with artists (ordered via junction tables)
- Artwork inheritance: Songs inherit album artwork if they don't have their own

**Component Structure**:
- Uses shadcn-svelte UI components (via jsrepo)
- `app-sidebar.svelte`: Main navigation
- `inner-view.svelte`: Renders appropriate view based on active tab
- Data tables use TanStack Table Core

### Microservice (FastAPI in `microservice/`)

**Purpose**: Writes metadata from database back to audio files using mutagen
- `POST /write-metadata/{song_id}`: Queries SQLite database, reads song with all metadata, writes ID3 tags (MP3) or Vorbis comments to the audio file
- Connects directly to `svelte/local.db` SQLite database
- Handles both ID3 (MP3) and other audio formats

## Development Commands

### Frontend (run from `svelte/` directory)
```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run preview          # Preview production build
npm run check            # Type-check
npm run check:watch      # Type-check in watch mode
npm run format           # Format with Prettier
npm run lint             # Check formatting
```

### Database (run from `svelte/` directory)
```bash
npm run db:push          # Push schema changes to database
npm run db:generate      # Generate migrations
npm run db:migrate       # Run migrations
npm run db:studio        # Open Drizzle Studio GUI
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

**Creating Songs with Album Context**:
1. If song belongs to album, inherit album's artwork and artists
2. Artists and artwork can be overridden at song level
3. Junction tables maintain artist order for display

**Updating Relationships**:
- Use `setSongArtists` / `setAlbumArtists` helpers (delete + recreate for simplicity)
- Order field in junction tables determines artist display order

**Querying with Relations**:
- Always use Drizzle's relational queries with `with` for nested data
- Helper functions in `helpers.ts` encapsulate common query patterns
- Avoid raw SQL unless necessary

## Tech Stack Notes

- **Svelte 5**: Uses runes (`$derived`, `$props`, `$state`) - not Svelte 4 syntax
- **Drizzle ORM**: Relational query API preferred over raw SQL
- **SQLite**: Single `local.db` file, shared between frontend and microservice
- **TailwindCSS 4**: Configured via Vite plugin
- **TypeScript**: Strict mode enabled

## File Uploads

- Songs uploaded to `static/uploads/songs/`
- Album artwork uploaded to `static/uploads/artwork/`
- Files timestamped on server: `${Date.now()}-${file.name}`
- Filepaths stored in database with `/uploads/...` prefix
