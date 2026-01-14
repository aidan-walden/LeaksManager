# Wails Setup Guide

This guide will help you set up, develop, and build the Leaks Manager desktop application using Wails v2.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development Workflow](#development-workflow)
- [Building for Production](#building-for-production)
- [Platform-Specific Notes](#platform-specific-notes)
- [Troubleshooting](#troubleshooting)
- [Architecture Overview](#architecture-overview)

## Prerequisites

Before you begin, ensure you have the following installed:

### Required

- **Go 1.21+**: [Download Go](https://golang.org/dl/)
- **Node.js 18+**: [Download Node.js](https://nodejs.org/)
- **pnpm**: Install with `npm install -g pnpm`
- **Wails CLI v2**: Install with `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

### Platform-Specific Requirements

#### macOS
- Xcode Command Line Tools: `xcode-select --install`
- macOS 10.15+ (Catalina or later)

#### Windows
- WebView2 Runtime (usually pre-installed on Windows 10/11)
- MinGW-w64 (for CGO support): [Download](https://www.mingw-w64.org/)
- Or use MSYS2: [Download](https://www.msys2.org/)

#### Linux
- gcc, pkg-config, libgtk-3-dev, libwebkit2gtk-4.0-dev
- Ubuntu/Debian: `sudo apt install gcc pkg-config libgtk-3-dev libwebkit2gtk-4.0-dev`
- Fedora: `sudo dnf install gcc pkg-config gtk3-devel webkit2gtk3-devel`

## Installation

### 1. Clone and Install Dependencies

```bash
# navigate to project directory
cd leaks-manager

# install frontend dependencies
cd svelte
pnpm install
cd ..

# download go dependencies
go mod download
```

### 2. Verify Installation

```bash
# check wails installation
wails doctor

# should show:
# - Go version 1.21+
# - Node version 18+
# - Wails v2.x.x
# - Platform-specific requirements met
```

## Development Workflow

### Starting Development Server

The Wails development server provides hot-reload for both Go backend and Svelte frontend.

```bash
# option 1: using pnpm script (recommended)
pnpm wails:dev

# option 2: direct wails command
wails dev
```

This will:
1. Compile the Go backend
2. Start the Vite dev server for the frontend
3. Launch the desktop app with hot-reload enabled
4. Open the app window

### Development Mode Features

- **Hot Reload**: Frontend changes auto-reload
- **Go Backend Recompilation**: Backend changes trigger rebuild
- **Debug Console**: Access browser dev tools (right-click → Inspect)
- **Database Location**: Uses `svelte/local.db` in project directory
- **File Uploads**: Saved to `svelte/static/uploads/`

### Project Structure

```
leaks-manager/
├── main.go                 # wails entry point
├── app.go                  # go backend (1,970 lines)
├── wails.json              # wails configuration
├── go.mod                  # go dependencies
├── svelte/                 # sveltekit frontend
│   ├── src/
│   │   ├── lib/
│   │   │   └── wails/      # typescript bindings
│   │   └── routes/
│   ├── static/
│   │   └── uploads/        # user-uploaded files
│   ├── build/              # production frontend build
│   └── local.db            # sqlite database (dev mode)
└── build/                  # wails production builds
```

## Building for Production

### Build for Current Platform

```bash
# option 1: using pnpm script
pnpm wails:build

# option 2: direct wails command
wails build
```

Output location:
- **macOS**: `build/bin/leaks-manager.app`
- **Windows**: `build/bin/leaks-manager.exe`
- **Linux**: `build/bin/leaks-manager`

### Build for Specific Platforms

#### macOS Universal Binary

```bash
pnpm wails:build:darwin
# creates universal binary for both Intel and Apple Silicon
```

#### Windows AMD64

```bash
pnpm wails:build:windows
# creates Windows 64-bit executable
```

### Build Options

```bash
# production build (optimized, no debug)
wails build

# debug build (includes debug symbols)
wails build -debug

# skip frontend build (use existing build/)
wails build -s

# clean build (remove previous builds)
wails build -clean

# specify output directory
wails build -o custom-name
```

## Platform-Specific Notes

### macOS

#### Code Signing (for Distribution)

macOS requires apps to be signed and notarized for distribution outside the App Store.

```bash
# sign the app
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" build/bin/leaks-manager.app

# create dmg for distribution
wails build -platform darwin/universal -nsis
```

#### App Location

In production, the app stores data in:
```
~/Library/Application Support/leaks-manager/
├── local.db
└── uploads/
    ├── songs/
    └── artwork/
```

### Windows

#### WebView2 Runtime

Windows builds require WebView2 Runtime. Most Windows 10/11 systems have it pre-installed.

For distribution, you can:
1. Bundle WebView2 installer with your app
2. Use Wails' built-in WebView2 bootstrap

#### Build Notes

- Use MinGW-w64 or MSYS2 for CGO support (required for SQLite)
- Builds create an `.exe` file in `build/bin/`

#### App Location

In production, the app stores data in:
```
%APPDATA%/leaks-manager/
├── local.db
└── uploads/
    ├── songs/
    └── artwork/
```

### Linux

#### Dependencies

Ensure runtime dependencies are installed on target systems:
- GTK 3
- WebKit2GTK 4.0

#### Distribution

Consider creating:
- `.deb` package for Debian/Ubuntu
- `.rpm` package for Fedora/RHEL
- AppImage for universal Linux support
- Snap or Flatpak for sandboxed distribution

#### App Location

In production, the app stores data in:
```
~/.local/share/leaks-manager/
├── local.db
└── uploads/
    ├── songs/
    └── artwork/
```

## Troubleshooting

### Common Issues

#### "Wails runtime not available" Error

**Symptom**: Frontend shows error about missing Wails runtime.

**Solution**:
- You're trying to run the frontend outside of Wails
- Use `pnpm wails:dev` instead of `pnpm dev`

#### Database Connection Errors

**Symptom**: App can't connect to SQLite database.

**Solutions**:
- In dev mode: Ensure `svelte/local.db` exists
- In production: Check app data directory permissions
- Verify CGO is enabled: `go env CGO_ENABLED` should be `1`

#### CGO Errors on Windows

**Symptom**: Build fails with CGO-related errors.

**Solution**:
- Install MinGW-w64 or MSYS2
- Add to PATH: `C:\msys64\mingw64\bin`
- Set environment variable: `set CGO_ENABLED=1`

#### "command not found: wails"

**Symptom**: Shell can't find the `wails` command.

**Solution**:
- Ensure `$GOPATH/bin` is in your PATH
- Verify installation: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- Check: `which wails` (Unix) or `where wails` (Windows)

#### Frontend Build Failures

**Symptom**: Wails can't build the frontend.

**Solution**:
- Manually test: `cd svelte && pnpm build`
- Check for TypeScript errors: `cd svelte && pnpm check`
- Ensure all dependencies installed: `cd svelte && pnpm install`

### Debug Mode

Enable verbose logging:

```bash
# run with debug logging
wails dev -v 2

# or set environment variable
export WAILS_LOG_LEVEL=DEBUG
wails dev
```

### Performance Issues

If the app is slow:
- Check database size (`svelte/local.db` or app data directory)
- Monitor file upload directory size
- Consider implementing pagination (already implemented for songs/albums)

## Architecture Overview

### Backend (Go)

- **Entry Point**: `main.go` - Wails application bootstrap
- **App Logic**: `app.go` - All business logic, CRUD operations, metadata handling
- **Database**: SQLite with `mattn/go-sqlite3`
- **Metadata**:
  - Extraction: `dhowden/tag` library
  - Writing: `bogem/id3v2/v2` library (MP3 only)

### Frontend (SvelteKit)

- **Framework**: Svelte 5 with runes
- **Adapter**: `@sveltejs/adapter-static` for Wails compatibility
- **Bindings**: `svelte/src/lib/wails/` contains TypeScript bindings
- **Routing**: Client-side only (`ssr = false`)
- **State**: Initial data loaded via `GetInitialData()`

### Data Flow

1. **Startup**: `main.go` → `app.startup()` → Opens database
2. **Frontend Load**: `+layout.ts` → `GetInitialData()` → Loads songs, albums, artists
3. **User Actions**: Component → Wails binding → Go function → Database
4. **File Operations**: Upload → Base64 encode → Go backend → Save to disk
5. **Metadata**: Extract → Parse → Create DB records → Write back to file

### Key Features

- **CRUD Operations**: Songs, albums, artists, producers
- **Metadata Workflows**: Upload → Extract → Map artists → Create songs
- **Producer Matching**: Automatic matching from filename patterns
- **Batch Operations**: Concurrent metadata writing with semaphores
- **File Management**: Upload, storage, cleanup
- **Settings**: Persistent app configuration

## Migration from Python Microservice

The `microservice-py/` directory contains the deprecated FastAPI Python service. The Wails version has completely replaced it with Go code in `app.go`.

### What Changed

- **Metadata Extraction**: `mutagen` (Python) → `dhowden/tag` (Go)
- **Metadata Writing**:
  - MP3: `bogem/id3v2` (Go)
  - FLAC: `go-flac/flacvorbis` + `go-flac/flacpicture` (Go)
  - M4A/MP4: `Sorrow446/go-mp4tag` (Go)
  - OGG Vorbis: `ambeloe/oggv/vorbiscomment` (Go)
- **Concurrency**: `ThreadPoolExecutor` (Python) → Goroutines + Semaphores (Go)
- **Database**: Shared SQLite file accessed directly in Go

### Supported Audio Formats

All major audio formats are now supported for both reading and writing metadata:

- **MP3**: Full ID3v2 tag support with artwork
- **FLAC**: Vorbis comments and embedded pictures
- **M4A/MP4**: iTunes-style metadata atoms
- **OGG Vorbis**: Vorbis comments with base64-encoded artwork

Each format handler includes support for:
- Title, Artist, Album metadata
- Year and Track Number
- Embedded artwork (with automatic format detection)

## Additional Resources

- [Wails Documentation](https://wails.io/docs)
- [Wails Examples](https://github.com/wailsapp/wails/tree/master/v2/examples)
- [SvelteKit Documentation](https://kit.svelte.dev/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)

## Getting Help

If you encounter issues:

1. Check this documentation
2. Run `wails doctor` to verify setup
3. Check the [Wails GitHub Issues](https://github.com/wailsapp/wails/issues)
4. Review application logs in the console

## Next Steps

After setup:

1. **Start Development**: `pnpm wails:dev`
2. **Explore the App**: Upload songs, create albums, manage metadata
3. **Test Features**: Try all CRUD operations
4. **Build for Production**: `pnpm wails:build`
5. **Distribute**: Sign and package for your target platform

Enjoy building with Wails!
