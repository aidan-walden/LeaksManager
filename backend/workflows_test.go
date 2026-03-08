package backend

import (
	"database/sql"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

func newTestApp(t *testing.T) *App {
	t.Helper()

	tempDir := t.TempDir()
	staticPath := filepath.Join(tempDir, "svelte")
	dbPath := filepath.Join(tempDir, "local.db")

	for _, dir := range []string{
		filepath.Join(staticPath, "uploads", "songs"),
		filepath.Join(staticPath, "uploads", "artwork"),
	} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("failed to create test directory %q: %v", dir, err)
		}
	}

	db, err := sql.Open("sqlite3_custom", dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	app := &App{
		db:         db,
		dbPath:     dbPath,
		staticPath: staticPath,
	}

	if err := app.runMigrations(); err != nil {
		db.Close()
		t.Fatalf("failed to run migrations: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})

	return app
}

func TestUploadAndExtractMetadataKeepsUnreadableFilesInWorkflow(t *testing.T) {
	app := newTestApp(t)

	result, err := app.UploadAndExtractMetadata([]FileUpload{
		{
			Filename:   "demo.txt",
			Base64Data: base64.StdEncoding.EncodeToString([]byte("not audio metadata")),
		},
	}, nil)
	if err != nil {
		t.Fatalf("UploadAndExtractMetadata returned error: %v", err)
	}

	if len(result.FilesData) != 1 {
		t.Fatalf("expected 1 uploaded file, got %d", len(result.FilesData))
	}
	if result.FilesData[0].Metadata.Title != "" {
		t.Fatalf("expected unreadable metadata to fall back to zero values, got %q", result.FilesData[0].Metadata.Title)
	}
	if result.FilesWithArtwork != 0 {
		t.Fatalf("expected no artwork count, got %d", result.FilesWithArtwork)
	}

	fullPath, err := app.staticFilePath(result.FilesData[0].Filepath)
	if err != nil {
		t.Fatalf("staticFilePath returned error: %v", err)
	}
	if _, err := os.Stat(fullPath); err != nil {
		t.Fatalf("expected uploaded file to exist at %q: %v", fullPath, err)
	}
}

func TestCreateSongsWithMetadataCreatesArtistsAndInheritsAlbumArtwork(t *testing.T) {
	app := newTestApp(t)

	existingArtist, err := app.CreateArtist(CreateArtistInput{Name: "Existing Artist"})
	if err != nil {
		t.Fatalf("CreateArtist returned error: %v", err)
	}

	album, err := app.CreateAlbum(CreateAlbumInput{
		Name:      "Inherited Album",
		ArtistIDs: []int{existingArtist.ID},
	})
	if err != nil {
		t.Fatalf("CreateAlbum returned error: %v", err)
	}

	artworkPath := "uploads/artwork/inherited.jpg"
	if _, err := app.db.Exec(`UPDATE albums SET artwork_path = ? WHERE id = ?`, artworkPath, album.ID); err != nil {
		t.Fatalf("failed to seed album artwork: %v", err)
	}

	relSongPath := filepath.ToSlash(filepath.Join("uploads", "songs", "seed.mp3"))
	fullSongPath, err := app.staticFilePath(relSongPath)
	if err != nil {
		t.Fatalf("staticFilePath returned error: %v", err)
	}
	if err := os.WriteFile(fullSongPath, []byte("fake audio payload"), 0644); err != nil {
		t.Fatalf("failed to seed song file: %v", err)
	}

	songs, err := app.CreateSongsWithMetadata(CreateSongsWithMetadataInput{
		AlbumID: &album.ID,
		FilesData: []FileData{
			{
				OriginalFilename: "seed.mp3",
				Filepath:         relSongPath,
				AlbumID:          &album.ID,
				Metadata: ExtractedMetadata{
					Title:       "Imported Song",
					Genre:       "Rap",
					Year:        2024,
					TrackNumber: 2,
					Duration:    184.5,
				},
				ParsedArtists: []string{"Existing Artist", "New Artist"},
			},
		},
		ArtistMapping: map[string]any{
			"New Artist": "CREATE_NEW",
		},
		UseEmbeddedArtwork: false,
	})
	if err != nil {
		t.Fatalf("CreateSongsWithMetadata returned error: %v", err)
	}

	if len(songs) != 1 {
		t.Fatalf("expected 1 created song, got %d", len(songs))
	}
	if songs[0].ArtworkPath == nil || *songs[0].ArtworkPath != artworkPath {
		t.Fatalf("expected song to inherit artwork path %q, got %#v", artworkPath, songs[0].ArtworkPath)
	}
	if songs[0].TrackNumber == nil || *songs[0].TrackNumber != 2 {
		t.Fatalf("expected track number to be preserved, got %#v", songs[0].TrackNumber)
	}

	createdArtist, err := app.FindArtistByName("New Artist")
	if err != nil {
		t.Fatalf("FindArtistByName returned error: %v", err)
	}
	if createdArtist == nil {
		t.Fatal("expected mapped CREATE_NEW artist to be created")
	}

	readableSongs, err := app.GetSongsReadable(10, 0)
	if err != nil {
		t.Fatalf("GetSongsReadable returned error: %v", err)
	}
	if len(readableSongs) != 1 {
		t.Fatalf("expected 1 readable song, got %d", len(readableSongs))
	}
	if readableSongs[0].Artist != "Existing Artist, New Artist" {
		t.Fatalf("expected artists to be linked in order, got %q", readableSongs[0].Artist)
	}
	if readableSongs[0].Album == nil || readableSongs[0].Album.Name != "Inherited Album" {
		t.Fatalf("expected song to be linked to inherited album, got %#v", readableSongs[0].Album)
	}
}
