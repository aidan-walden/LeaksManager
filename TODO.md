# Bugs and unintended behavior review

Scope: static read of repository files only (no code changes).

## Prioritized list

1) Uploads are written to the wrong location (absolute path join)
- File: `backend/files.go:22-54`
- `SaveUploadedFile` and `SaveArtwork` build `relPath` with a leading `/` and then use `filepath.Join(a.staticPath, relPath)`. On Unix/macOS, a leading `/` makes the join ignore `a.staticPath`, so files are written to `/uploads/...` instead of the app’s data directory or `svelte/uploads/...`.
- Consequences: writes fail on most systems (permission denied), metadata extraction fails (`ExtractMetadata` opens the wrong path), `DeleteSong` deletes the wrong path, and `CreateUploadsHandler` serves the wrong directory.
- Related callers rely on the returned `relPath`, so the wrong prefix is persisted in DB and reused downstream.

2) Uploads HTTP handler ignores staticPath (and can escape the intended root)
- File: `backend/handler.go:39-44`
- `filepath.Join(staticPath, r.URL.Path)` receives an absolute `r.URL.Path` like `/uploads/artwork/x.jpg`, so `staticPath` is dropped and the file is served from `/uploads/...` on the root filesystem instead of the app data dir.
- Because the path is not cleaned/validated beyond the `/uploads/` prefix, a request like `/uploads/../somewhere` can escape the intended root; `http.ServeFile` will clean the path and potentially serve outside the uploads directory.

3) Errors are widely ignored in multi-step DB writes, leading to partial data
- Files:
  - `backend/songs.go:35-62`, `backend/songs.go:78-106`
  - `backend/albums.go:60-85`
  - `backend/producers.go:64-109`, `backend/producers.go:137-188`
  - `backend/settings.go:36-55`, `backend/settings.go:63-75`
  - `backend/workflows.go:35-78`, `backend/workflows.go:120-230`, `backend/workflows.go:246-335`
- Many `Exec`/`QueryRow`/`Scan` errors are dropped (e.g., linking artists/producers, clearing links, settings updates). This can silently leave the database in a partially updated state with missing junction rows, but the API still returns success.

4) Apple Music sync is effectively non-functional
- File: `backend/apple_music.go:252-334`
- `verifyAppleMusicTrack`, `findAppleMusicTrack`, `updateAppleMusicTrack`, and `addTrackToAppleMusic` return TODO errors. `SyncSongsToAppleMusic` and `syncSingleSong` therefore fail every song with “Failed to add track” or similar.
- User-facing behavior: “Sync” will always report failures, even on macOS with Music installed.

5) File type accept filtering is broken for extension patterns
- File: `svelte/src/lib/components/ui/file-drop-zone/file-drop-zone.svelte:73-90`
- The extension check uses `if (fileType.startsWith('.'))`, but it should check the `pattern` (e.g., `.mp3`). As written, extension-based accept lists never match because `fileType` is a MIME type like `audio/mpeg`.
- Result: “accept” values such as `.mp3,.wav` will not filter correctly; users can select rejected extensions.

6) UpdateProducerWithAliases returns an incorrect CreatedAt timestamp
- File: `backend/producers.go:173-186`
- `UpdateProducerWithAliases` returns `CreatedAt: now` instead of the original created timestamp, which makes the UI or API consumers see the producer as newly created on every update.

7) Artist order in metadata write is nondeterministic
- File: `backend/metadata.go:129-168`
- `GROUP_CONCAT(ar.name, ', ')` has no ORDER BY for `song_artists`, so artist order in the resulting metadata is undefined. This can shuffle artist order in written tags even though a specific order is stored in `song_artists`.

8) Dev/prod detection can route new dev installs to the production data dir
- File: `backend/app.go:80-119`
- Dev mode is detected by the existence of `svelte/local.db`. If the DB doesn’t exist yet (fresh dev checkout), the app assumes production mode and writes the DB and uploads into the user’s home data directory, which is surprising for local dev.

---

Notes
- The path-joining issue in (1) also affects `backend/metadata.go:40-47`, `backend/songs.go:103-116`, and other places that reuse the stored `relPath`. The root cause is the leading `/` in `relPath` values stored in the DB.
