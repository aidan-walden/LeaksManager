package backend

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
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
