package backend

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// GetAppleMusicLibrary fetches all user-saved tracks from Apple Music via AppleScript
func (a *App) GetAppleMusicLibrary() ([]AppleMusicTrack, error) {
	if runtime.GOOS != "darwin" {
		return nil, fmt.Errorf("Apple Music integration is only available on macOS")
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

	cmd := exec.Command("osascript", "-e", script)
	out, err := cmd.Output()
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
		if err != nil || !exists {
			// Track not found, need to search or add
			appleMusicID = ""
		} else {
			appleMusicID = *song.AppleMusicID
		}
	}

	// If no valid Apple Music ID, search for track
	if appleMusicID == "" {
		foundID, err := a.findAppleMusicTrack(song)
		if err == nil && foundID != "" {
			appleMusicID = foundID
		}
	}

	// If track found, update it; otherwise, add it
	if appleMusicID != "" {
		// Update existing track
		err := a.updateAppleMusicTrack(appleMusicID, song)
		if err != nil {
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

// verifyAppleMusicTrack checks if a track with the given persistent ID exists
func (a *App) verifyAppleMusicTrack(persistentID string) (bool, error) {
	// TODO: Implement AppleScript to check if track exists
	// tell application "Music"
	//     exists (first track whose persistent ID is "{persistentID}")
	// end tell
	return false, fmt.Errorf("TODO: Implement verifyAppleMusicTrack")
}

// findAppleMusicTrack searches for a track in Apple Music library
// Returns persistent ID if found, empty string if not found
func (a *App) findAppleMusicTrack(song SongReadable) (string, error) {
	// TODO: Implement AppleScript search logic
	// Search by: name, artist, album
	// tell application "Music"
	//     set matches to (every track whose name is "{name}" and artist is "{artist}")
	//     if (count of matches) > 0 then
	//         return persistent ID of first item of matches
	//     end if
	// end tell
	return "", fmt.Errorf("TODO: Implement findAppleMusicTrack")
}

// updateAppleMusicTrack updates an existing track's metadata via AppleScript
func (a *App) updateAppleMusicTrack(persistentID string, song SongReadable) error {
	// TODO: Implement AppleScript metadata update
	// tell application "Music"
	//     set t to (first track whose persistent ID is "{persistentID}")
	//     set name of t to "{song.Name}"
	//     set artist of t to "{artistNames}"
	//     set album of t to "{song.Album.Name}"
	//     set genre of t to "{song.Genre}"
	//     set year of t to {song.Year}
	//     set track number of t to {song.TrackNumber}
	// end tell
	return fmt.Errorf("TODO: Implement updateAppleMusicTrack")
}

// addTrackToAppleMusic adds a new track file to Apple Music library
// Returns the persistent ID of the newly added track
func (a *App) addTrackToAppleMusic(song SongReadable) (string, error) {
	// TODO: Implement AppleScript to add track file
	// tell application "Music"
	//     set newTrack to add POSIX file "{song.Filepath}"
	//     -- Update metadata after adding
	//     set name of newTrack to "{song.Name}"
	//     set artist of newTrack to "{artistNames}"
	//     -- etc.
	//     return persistent ID of newTrack
	// end tell
	return "", fmt.Errorf("TODO: Implement addTrackToAppleMusic")
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
