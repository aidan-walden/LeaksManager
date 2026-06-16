package backend

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/dhowden/tag"
)

// --- Metadata Logic ---

// SongTags is the cross-format tag payload assembled from SongMetadata/DB rows.
// Adapters consume this; format-specific quirks stay inside each adapter.
type SongTags struct {
	Title          string
	Artist         string
	AlbumArtist    string
	Album          string
	Genre          string
	Year           int32
	TrackNumberStr string
	TrackNumber    int32
	TrackTotal     int32
	Producers      string
	// resolved absolute artwork path (empty if none)
	ArtworkPath     string
	ArtworkMimeType string
}

// MetadataWriter is the seam each container format implements.
type MetadataWriter interface {
	Write(path string, tags SongTags) error
	Read(path string) (SongTags, error)
}

// pickAdapter chooses the writer for an extension. Returns nil if unsupported.
func pickAdapter(ext string) MetadataWriter {
	switch strings.ToLower(ext) {
	case ".mp3":
		return id3Adapter{}
	case ".flac":
		return flacAdapter{}
	case ".m4a", ".mp4", ".m4b", ".m4p":
		return mp4Adapter{}
	case ".ogg", ".oga":
		return oggAdapter{}
	}
	return nil
}

// ExtractMetadata replaces POST /extract-metadata
func (a *App) ExtractMetadata(relPath string) (*ExtractedMetadata, error) {
	fullPath, err := a.staticFilePath(relPath)
	if err != nil {
		return nil, err
	}

	f, err := os.Open(fullPath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %s", fullPath)
	}
	defer f.Close()

	// dhowden/tag handles all supported containers for reads
	m, err := tag.ReadFrom(f)
	if err != nil {
		return nil, fmt.Errorf("failed to parse metadata: %v", err)
	}

	result := &ExtractedMetadata{
		Title:       m.Title(),
		Artist:      m.Artist(),
		Album:       m.Album(),
		AlbumArtist: m.AlbumArtist(),
		Genre:       m.Genre(),
		Year:        m.Year(),
	}

	track, _ := m.Track()
	result.TrackNumber = track

	if pic := m.Picture(); pic != nil {
		result.Artwork = &ArtworkData{
			MimeType: pic.MIMEType,
			Data:     base64.StdEncoding.EncodeToString(pic.Data),
		}
	}

	return result, nil
}

// WriteSongMetadata replaces GET /write-metadata/{song_id}
func (a *App) WriteSongMetadata(songID int) (SongProcessingResult, error) {
	err := a.writeSongMetadataInternal(songID)
	if err != nil {
		return SongProcessingResult{SongID: songID, Success: false, Error: err.Error()}, nil
	}
	return SongProcessingResult{SongID: songID, Success: true}, nil
}

// WriteAlbumMetadata replaces GET /write-metadata/album/{album_id}
func (a *App) WriteAlbumMetadata(albumID int) (BatchResult, error) {
	rows, err := a.db.Query("SELECT id FROM songs WHERE album_id = ?", albumID)
	if err != nil {
		return BatchResult{}, err
	}
	defer rows.Close()

	songIDs := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return BatchResult{}, err
		}
		songIDs = append(songIDs, id)
	}
	if err := rows.Err(); err != nil {
		return BatchResult{}, err
	}

	results := make([]SongProcessingResult, len(songIDs))
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 4)

	for i, id := range songIDs {
		wg.Add(1)
		go func(index int, sID int) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			err := a.writeSongMetadataInternal(sID)
			res := SongProcessingResult{SongID: sID, Success: true}
			if err != nil {
				res.Success = false
				res.Error = err.Error()
			}
			results[index] = res
		}(i, id)
	}

	wg.Wait()

	successCount := 0
	failCount := 0
	for _, r := range results {
		if r.Success {
			successCount++
		} else {
			failCount++
		}
	}

	return BatchResult{
		Success:        true,
		Message:        fmt.Sprintf("Processed album %d", albumID),
		SongsProcessed: successCount,
		SongsFailed:    failCount,
		Results:        results,
	}, nil
}

func (a *App) writeSongMetadataInternal(songID int) error {
	tags, fullPath, err := a.buildSongTags(songID)
	if err != nil {
		return err
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	adapter := pickAdapter(ext)
	if adapter == nil {
		return fmt.Errorf("writing support for %s not yet implemented", ext)
	}
	return adapter.Write(fullPath, tags)
}

func nullStr(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

func nullInt(ns sql.NullInt32) int32 {
	if ns.Valid {
		return ns.Int32
	}
	return 0
}

// buildSongTags assembles SongTags from the DB. Returns the resolved file path too.
func (a *App) buildSongTags(songID int) (SongTags, string, error) {
	query := `
    SELECT
        s.name, s.filepath, s.genre, s.year, s.track_number,
        s.artwork_path, a.name, a.genre, a.artwork_path,
        GROUP_CONCAT(ar.name, ', '),
        (
            SELECT GROUP_CONCAT(ar2.name, ', ')
            FROM album_artists aa
            LEFT JOIN artists ar2 ON aa.artist_id = ar2.id
            WHERE aa.album_id = s.album_id
            ORDER BY aa."order"
        ),
        (
            SELECT GROUP_CONCAT(p.name, ', ')
            FROM song_producers sp
            LEFT JOIN producers p ON sp.producer_id = p.id
            WHERE sp.song_id = s.id
            ORDER BY sp."order"
        )
    FROM songs s
    LEFT JOIN albums a ON s.album_id = a.id
    LEFT JOIN song_artists sa ON s.id = sa.song_id
    LEFT JOIN artists ar ON sa.artist_id = ar.id
    WHERE s.id = ?
    GROUP BY s.id`

	var sName, sPath string
	var sGenre, sArt, aName, aGenre, aArt, artists, albumArtists, producers sql.NullString
	var sYear, sTrack sql.NullInt32

	err := a.db.QueryRow(query, songID).Scan(
		&sName, &sPath, &sGenre, &sYear, &sTrack,
		&sArt, &aName, &aGenre, &aArt, &artists, &albumArtists, &producers,
	)
	if err == sql.ErrNoRows {
		return SongTags{}, "", fmt.Errorf("song not found")
	} else if err != nil {
		return SongTags{}, "", err
	}

	fullPath, err := a.staticFilePath(sPath)
	if err != nil {
		return SongTags{}, "", err
	}

	genreToWrite := nullStr(sGenre)
	if genreToWrite == "" {
		genreToWrite = nullStr(aGenre)
	}

	albumName := nullStr(aName)
	songArt := nullStr(sArt)
	albumArt := nullStr(aArt)

	artistStr := nullStr(artists)
	albumArtist := nullStr(albumArtists)
	if albumArtist == "" {
		albumArtist = artistStr
	}

	producersStr := nullStr(producers)
	year := nullInt(sYear)
	trackNumber := nullInt(sTrack)

	trackNumberStr := ""
	trackTotal := int32(0)
	settings, err := a.GetSettings()
	if err != nil {
		return SongTags{}, "", err
	}
	if albumName == "" {
		if settings.AutomaticallyMakeSingles {
			albumName = fmt.Sprintf("%s - Single", sName)
			trackNumberStr = "1/1"
			trackNumber = 1
			trackTotal = 1
		} else {
			trackNumber = 0
		}
	} else {
		var totalTracks sql.NullInt32
		countErr := a.db.QueryRow(`
			SELECT COUNT(*)
			FROM songs
			WHERE album_id = (SELECT album_id FROM songs WHERE id = ?)
		`, songID).Scan(&totalTracks)
		if countErr == nil && totalTracks.Valid {
			trackTotal = totalTracks.Int32
		} else if countErr != nil && countErr != sql.ErrNoRows {
			return SongTags{}, "", countErr
		}

		if trackNumber > 0 {
			if trackTotal > 0 {
				trackNumberStr = fmt.Sprintf("%d/%d", trackNumber, trackTotal)
			} else {
				trackNumberStr = fmt.Sprintf("%d", trackNumber)
			}
		}
	}

	// resolve artwork: song art preferred, fall back to album art
	artRel := songArt
	if artRel == "" {
		artRel = albumArt
	}
	artPath := ""
	artMime := ""
	if artRel != "" {
		resolved, pathErr := a.staticFilePath(artRel)
		if pathErr != nil {
			return SongTags{}, "", pathErr
		}
		artPath = resolved
		artMime = "image/jpeg"
		if strings.HasSuffix(strings.ToLower(artRel), ".png") {
			artMime = "image/png"
		}
	}

	return SongTags{
		Title:           sName,
		Artist:          artistStr,
		AlbumArtist:     albumArtist,
		Album:           albumName,
		Genre:           genreToWrite,
		Year:            year,
		TrackNumberStr:  trackNumberStr,
		TrackNumber:     trackNumber,
		TrackTotal:      trackTotal,
		Producers:       producersStr,
		ArtworkPath:     artPath,
		ArtworkMimeType: artMime,
	}, fullPath, nil
}
