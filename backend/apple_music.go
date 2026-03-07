package backend

import (
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// GetAppleMusicLibrary fetches all user-saved tracks from Apple Music via AppleScript
func (a *App) GetAppleMusicLibrary() ([]AppleMusicTrack, error) {
	if runtime.GOOS != "darwin" {
		return nil, fmt.Errorf("Apple Music integration is only available on macOS")
	}
	if !a.isAppleMusicImportEnabled() {
		return []AppleMusicTrack{}, nil
	}

	// AppleScript to get all tracks with relevant properties
	// We use "user" playlist to get everything the user has added to their library
	script := `
		tell application "Music"
			set trackList to {}
			set allTracks to every track of playlist "Library"
			
			set output to ""
			
			repeat with t in allTracks
				try
					set tId to persistent ID of t
					set tName to name of t
					set tArtist to artist of t
					set tAlbumArtist to album artist of t
					set tAlbum to album of t
					set tGenre to genre of t
					set tYear to year of t
					set tDuration to duration of t
					set tTrackNumber to track number of t
					set tTrackCount to track count of t
					set tDiscNumber to disc number of t
					set tDiscCount to disc count of t
					
					set output to output & tId & "|||" & tName & "|||" & tArtist & "|||" & tAlbumArtist & "|||" & tAlbum & "|||" & tGenre & "|||" & tYear & "|||" & tDuration & "|||" & tTrackNumber & "|||" & tTrackCount & "|||" & tDiscNumber & "|||" & tDiscCount & "&&&"
				end try
			end repeat
			
			return output
		end tell
	`

	out, err := a.runAppleScriptOutput(script)
	if err != nil {
		return nil, fmt.Errorf("failed to execute AppleScript: %w", err)
	}

	outputStr := string(out)
	if outputStr == "" {
		return []AppleMusicTrack{}, nil
	}

	tracks := []AppleMusicTrack{}

	// Split by track delimiter
	trackStrings := strings.Split(outputStr, "&&&")

	for _, ts := range trackStrings {
		if strings.TrimSpace(ts) == "" {
			continue
		}

		// Split by property delimiter
		props := strings.Split(ts, "|||")
		if len(props) < 12 {
			continue
		}

		year, _ := strconv.Atoi(props[6])
		duration, _ := strconv.ParseFloat(props[7], 64)
		trackNumber, _ := strconv.Atoi(props[8])
		trackCount, _ := strconv.Atoi(props[9])
		discNumber, _ := strconv.Atoi(props[10])
		discCount, _ := strconv.Atoi(props[11])

		track := AppleMusicTrack{
			ID:          props[0],
			Name:        props[1],
			Artist:      props[2],
			AlbumArtist: props[3],
			Album:       props[4],
			Genre:       props[5],
			Year:        year,
			Duration:    duration,
			TrackNumber: trackNumber,
			TrackCount:  trackCount,
			DiscNumber:  discNumber,
			DiscCount:   discCount,
		}

		tracks = append(tracks, track)
	}

	return tracks, nil
}

// SyncSongsToAppleMusic syncs all unsynced songs to Apple Music
// Returns detailed results including successes, failures, and errors
func (a *App) SyncSongsToAppleMusic() (*SyncResult, error) {
	// Platform check
	if runtime.GOOS != "darwin" {
		return nil, fmt.Errorf("Apple Music sync is only available on macOS")
	}
	if !a.isAppleMusicImportEnabled() {
		return &SyncResult{
			Results:     []SyncItemResult{},
			CompletedAt: time.Now().Unix(),
		}, nil
	}

	if err := a.ensureAppleMusicRunning(); err != nil {
		return nil, err
	}

	// Query all unsynced songs
	rows, err := a.db.Query(`
		SELECT id FROM songs WHERE synced = 0 ORDER BY id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var songIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		songIDs = append(songIDs, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := &SyncResult{
		TotalSongs:  len(songIDs),
		Results:     make([]SyncItemResult, 0, len(songIDs)),
		CompletedAt: time.Now().Unix(),
	}

	// Process each song
	for _, songID := range songIDs {
		itemResult := a.syncSingleSong(songID)
		result.Results = append(result.Results, itemResult)

		switch itemResult.Status {
		case "success", "added", "updated":
			result.SuccessCount++
			if itemResult.Status == "added" {
				result.AddedCount++
			} else if itemResult.Status == "updated" {
				result.UpdatedCount++
			}
		case "failed":
			result.FailureCount++
		}
	}

	return result, nil
}

// getSongReadableByID fetches a single song with all relations by ID
func (a *App) getSongReadableByID(songID int) (SongReadable, error) {
	var song Song
	var createdAt, updatedAt int64

	err := a.db.QueryRow(`
		SELECT id, name, album_id, artwork_path, genre, year, track_number, duration, filepath, file_type, created_at, updated_at, synced, apple_music_id
		FROM songs
		WHERE id = ?
	`, songID).Scan(&song.ID, &song.Name, &song.AlbumID, &song.ArtworkPath, &song.Genre, &song.Year, &song.TrackNumber, &song.Duration, &song.Filepath, &song.FileType, &createdAt, &updatedAt, &song.Synced, &song.AppleMusicID)

	if err != nil {
		return SongReadable{}, err
	}

	song.CreatedAt = createdAt
	song.UpdatedAt = updatedAt

	// Get artists
	artists, _ := a.getArtistsForSong(song.ID)
	artistNames := make([]string, len(artists))
	for i, art := range artists {
		artistNames[i] = art.Name
	}

	// Get producers
	producers, _ := a.getProducersForSong(song.ID)

	// Get album
	var album *Album
	if song.AlbumID != nil {
		album, _ = a.getAlbumByID(*song.AlbumID)
	}

	return SongReadable{
		Song:      song,
		Artist:    strings.Join(artistNames, ", "),
		Artists:   artists,
		Producers: producers,
		Album:     album,
	}, nil
}

// syncSingleSong handles syncing a single song to Apple Music
func (a *App) syncSingleSong(songID int) SyncItemResult {
	// Get full song details
	song, err := a.getSongReadableByID(songID)
	if err != nil {
		log.Printf("[AppleMusicSync] song_id=%d step=load_song error=%v", songID, err)
		return SyncItemResult{
			SongID:       songID,
			Status:       "failed",
			ErrorMessage: "Failed to load song details",
		}
	}

	var appleMusicID string
	var status string

	// Check if we have an existing Apple Music ID
	if song.AppleMusicID != nil && *song.AppleMusicID != "" {
		// Verify track still exists
		exists, err := a.verifyAppleMusicTrack(*song.AppleMusicID)
		if err != nil {
			log.Printf("[AppleMusicSync] song_id=%d song=%q step=verify_existing_track apple_music_id=%q error=%v", song.ID, song.Name, *song.AppleMusicID, err)
			appleMusicID = ""
		} else if !exists {
			// Track not found, need to search or add
			appleMusicID = ""
		} else {
			appleMusicID = *song.AppleMusicID
		}
	}

	// If no valid Apple Music ID, search for track
	if appleMusicID == "" {
		foundID, err := a.findAppleMusicTrack(song)
		if err != nil {
			log.Printf("[AppleMusicSync] song_id=%d song=%q step=find_track error=%v", song.ID, song.Name, err)
		} else if foundID != "" {
			appleMusicID = foundID
		}
	}

	// If track found, update it; otherwise, add it
	if appleMusicID != "" {
		// Update existing track
		err := a.updateAppleMusicTrack(appleMusicID, song)
		if err != nil {
			log.Printf("[AppleMusicSync] song_id=%d song=%q step=update_track apple_music_id=%q error=%v", song.ID, song.Name, appleMusicID, err)
			return SyncItemResult{
				SongID:       songID,
				SongName:     song.Name,
				Status:       "failed",
				ErrorMessage: fmt.Sprintf("Failed to update track: %v", err),
			}
		}
		status = "updated"
	} else {
		// Add new track to Apple Music
		newID, err := a.addTrackToAppleMusic(song)
		if err != nil {
			log.Printf("[AppleMusicSync] song_id=%d song=%q step=add_track filepath=%q error=%v", song.ID, song.Name, song.Filepath, err)
			return SyncItemResult{
				SongID:       songID,
				SongName:     song.Name,
				Status:       "failed",
				ErrorMessage: fmt.Sprintf("Failed to add track: %v", err),
			}
		}
		appleMusicID = newID
		status = "added"
	}

	// Save Apple Music ID and mark as synced
	err = a.markSongSynced(songID, appleMusicID)
	if err != nil {
		log.Printf("[AppleMusicSync] song_id=%d song=%q step=mark_synced apple_music_id=%q error=%v", song.ID, song.Name, appleMusicID, err)
		return SyncItemResult{
			SongID:       songID,
			SongName:     song.Name,
			Status:       "failed",
			AppleMusicID: &appleMusicID,
			ErrorMessage: fmt.Sprintf("Failed to mark as synced: %v", err),
		}
	}

	return SyncItemResult{
		SongID:       songID,
		SongName:     song.Name,
		Status:       status,
		AppleMusicID: &appleMusicID,
	}
}

// escapeAppleScript escapes backslashes and double quotes for AppleScript string interpolation
func escapeAppleScript(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}

func (a *App) runAppleScriptOutput(script string) ([]byte, error) {
	return a.runAppleScriptCommand(script)
}

func (a *App) runAppleScript(script string) error {
	_, err := a.runAppleScriptCommand(script)
	return err
}

func (a *App) runAppleScriptCommand(script string) ([]byte, error) {
	if !a.isAppleMusicImportEnabled() {
		return nil, nil
	}
	if err := a.ensureAppleMusicRunning(); err != nil {
		return nil, err
	}

	cmd := exec.Command("osascript", "-e", script)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[AppleScript] osascript failed: %v\n[AppleScript] output:\n%s\n[AppleScript] script:\n%s", err, strings.TrimSpace(string(output)), formatAppleScriptForLog(script))
		if len(output) > 0 {
			return output, fmt.Errorf("%w: %s", err, strings.TrimSpace(string(output)))
		}
		return output, err
	}
	return output, nil
}

func formatAppleScriptForLog(script string) string {
	lines := strings.Split(script, "\n")
	for i, line := range lines {
		lines[i] = fmt.Sprintf("%02d: %s", i+1, line)
	}
	return strings.Join(lines, "\n")
}

func (a *App) ensureAppleMusicRunning() error {
	if runtime.GOOS != "darwin" {
		return fmt.Errorf("Apple Music integration is only available on macOS")
	}
	if !a.isAppleMusicImportEnabled() {
		return nil
	}

	if a.isAppleMusicRunning() {
		return nil
	}

	if a.ctx == nil {
		return fmt.Errorf("Apple Music is not running")
	}

	choice, err := wailsruntime.MessageDialog(a.ctx, wailsruntime.MessageDialogOptions{
		Type:          wailsruntime.QuestionDialog,
		Title:         "Apple Music Closed",
		Message:       "Apple Music needs to be open before continuing. Open Apple Music now?",
		Buttons:       []string{"Open Apple Music", "Cancel"},
		DefaultButton: "Open Apple Music",
		CancelButton:  "Cancel",
	})
	if err != nil {
		return fmt.Errorf("failed to prompt to open Apple Music: %w", err)
	}
	if choice != "Open Apple Music" {
		return fmt.Errorf("Apple Music must be open to continue")
	}

	if err := exec.Command("open", "-a", "Music").Run(); err != nil {
		return fmt.Errorf("failed to open Apple Music: %w", err)
	}

	for range 20 {
		if a.isAppleMusicRunning() {
			return nil
		}
		time.Sleep(250 * time.Millisecond)
	}

	return fmt.Errorf("Apple Music did not finish opening")
}

func (a *App) isAppleMusicRunning() bool {
	return exec.Command("pgrep", "-x", "Music").Run() == nil
}

func (a *App) isAppleMusicImportEnabled() bool {
	if runtime.GOOS != "darwin" {
		return false
	}

	settings, err := a.GetSettings()
	if err != nil {
		return false
	}

	return settings.ImportToAppleMusic
}

// verifyAppleMusicTrack checks if a track with the given persistent ID exists
func (a *App) verifyAppleMusicTrack(persistentID string) (bool, error) {
	script := fmt.Sprintf(`
		tell application "Music"
			try
				first track whose persistent ID is "%s"
				return "true"
			on error
				return "false"
			end try
		end tell
	`, escapeAppleScript(persistentID))

	out, err := a.runAppleScriptOutput(script)
	if err != nil {
		return false, fmt.Errorf("failed to verify track: %w", err)
	}

	return strings.TrimSpace(string(out)) == "true", nil
}

// findAppleMusicTrack searches for a track in Apple Music library
// Returns persistent ID if found, empty string if not found
func (a *App) findAppleMusicTrack(song SongReadable) (string, error) {
	script := fmt.Sprintf(`
		tell application "Music"
			set matches to (every track of playlist "Library" whose name is "%s" and artist is "%s")
			if (count of matches) > 0 then
				return persistent ID of first item of matches
			else
				return ""
			end if
		end tell
	`, escapeAppleScript(song.Name), escapeAppleScript(song.Artist))

	out, err := a.runAppleScriptOutput(script)
	if err != nil {
		return "", fmt.Errorf("failed to search for track: %w", err)
	}

	return strings.TrimSpace(string(out)), nil
}

// buildMetadataScript builds AppleScript lines to set metadata on a track variable
func buildMetadataScript(trackVar string, song SongReadable) string {
	var lines []string
	lines = append(lines, fmt.Sprintf(`set name of %s to "%s"`, trackVar, escapeAppleScript(song.Name)))
	lines = append(lines, fmt.Sprintf(`set artist of %s to "%s"`, trackVar, escapeAppleScript(song.Artist)))

	if song.Album != nil {
		lines = append(lines, fmt.Sprintf(`set album of %s to "%s"`, trackVar, escapeAppleScript(song.Album.Name)))
	}
	if song.Genre != nil {
		lines = append(lines, fmt.Sprintf(`set genre of %s to "%s"`, trackVar, escapeAppleScript(*song.Genre)))
	}
	if song.Year != nil {
		lines = append(lines, fmt.Sprintf(`set year of %s to %d`, trackVar, *song.Year))
	}
	if song.TrackNumber != nil {
		lines = append(lines, fmt.Sprintf(`set track number of %s to %d`, trackVar, *song.TrackNumber))
	}

	return strings.Join(lines, "\n\t\t")
}

func (a *App) resolveAppleMusicArtworkPath(song SongReadable) (string, error) {
	if song.ArtworkPath != nil && *song.ArtworkPath != "" {
		return a.staticFilePath(*song.ArtworkPath)
	}
	if song.Album != nil && song.Album.ArtworkPath != nil && *song.Album.ArtworkPath != "" {
		return a.staticFilePath(*song.Album.ArtworkPath)
	}

	return "", nil
}

func (a *App) buildArtworkScript(trackVar string, song SongReadable) (string, error) {
	artworkPath, err := a.resolveAppleMusicArtworkPath(song)
	if err != nil {
		return "", err
	}
	if artworkPath == "" {
		return fmt.Sprintf(`if (count of artworks of %s) > 0 then delete every artwork of %s`, trackVar, trackVar), nil
	}

	return fmt.Sprintf(`
		set artworkFile to POSIX file "%s"
		set artworkData to read artworkFile as picture
		if (count of artworks of %s) = 0 then
			make new artwork at end of artworks of %s with properties {data:artworkData}
		else
			set data of artwork 1 of %s to artworkData
		end if
	`, escapeAppleScript(artworkPath), trackVar, trackVar, trackVar), nil
}

// updateAppleMusicTrack updates an existing track's metadata via AppleScript
func (a *App) updateAppleMusicTrack(persistentID string, song SongReadable) error {
	if err := a.writeSongMetadataInternal(song.ID); err != nil {
		return fmt.Errorf("failed to write source metadata before Apple Music sync: %w", err)
	}

	metadataLines := buildMetadataScript("t", song)
	artworkLines, err := a.buildArtworkScript("t", song)
	if err != nil {
		return fmt.Errorf("failed to prepare artwork update: %w", err)
	}
	script := fmt.Sprintf(`
		tell application "Music"
			set t to first track whose persistent ID is "%s"
			%s
			%s
		end tell
	`, escapeAppleScript(persistentID), metadataLines, artworkLines)

	if err = a.runAppleScript(script); err != nil {
		return fmt.Errorf("failed to update track: %w", err)
	}
	return nil
}

// addTrackToAppleMusic adds a new track file to Apple Music library
// Returns the persistent ID of the newly added track
func (a *App) addTrackToAppleMusic(song SongReadable) (string, error) {
	if song.Filepath == "" {
		return "", fmt.Errorf("song has no filepath")
	}
	if err := a.writeSongMetadataInternal(song.ID); err != nil {
		return "", fmt.Errorf("failed to write source metadata before adding to Apple Music: %w", err)
	}

	absPath, err := a.staticFilePath(song.Filepath)
	if err != nil {
		return "", fmt.Errorf("failed to resolve filepath: %w", err)
	}

	metadataLines := buildMetadataScript("newTrack", song)
	script := fmt.Sprintf(`
		tell application "Music"
			set newTrack to add POSIX file "%s"
			%s
			return persistent ID of newTrack
		end tell
	`, escapeAppleScript(absPath), metadataLines)

	out, err := a.runAppleScriptOutput(script)
	if err != nil {
		return "", fmt.Errorf("failed to add track: %w", err)
	}

	return strings.TrimSpace(string(out)), nil
}

// markSongSynced updates a song to synced=1 and saves Apple Music ID
func (a *App) markSongSynced(songID int, appleMusicID string) error {
	_, err := a.db.Exec(`
		UPDATE songs
		SET synced = 1, apple_music_id = ?, updated_at = ?
		WHERE id = ?
	`, appleMusicID, time.Now().Unix(), songID)
	return err
}
