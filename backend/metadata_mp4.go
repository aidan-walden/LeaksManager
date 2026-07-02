package backend

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// mp4Adapter handles M4A/MP4 via ffmpeg shell-out. ffmpeg dependency is
// contained here; no other adapter shells out for metadata.
type mp4Adapter struct{}

func (mp4Adapter) Write(path string, tags SongTags) error {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return fmt.Errorf("ffmpeg not found: %w", err)
	}

	tempPath := path + ".ffmpeg.m4a"

	args := []string{"-i", path}
	if tags.ArtworkPath != "" {
		args = append(args, "-i", tags.ArtworkPath)
	}

	args = append(args,
		"-map_metadata", "-1",
		"-map", "0:a",
	)
	if tags.ArtworkPath != "" {
		args = append(args,
			"-map", "1:0",
			"-c:a", "copy",
			"-c:v", "copy",
			"-disposition:v:0", "attached_pic",
		)
	} else {
		args = append(args, "-c", "copy")
	}
	args = append(args, "-movflags", "+faststart")

	if tags.Title != "" {
		args = append(args, "-metadata", fmt.Sprintf("title=%s", tags.Title))
	}
	if tags.Artist != "" {
		args = append(args, "-metadata", fmt.Sprintf("artist=%s", tags.Artist))
	}
	if tags.Album != "" {
		args = append(args, "-metadata", fmt.Sprintf("album=%s", tags.Album))
	}
	if tags.AlbumArtist != "" {
		args = append(args, "-metadata", fmt.Sprintf("album_artist=%s", tags.AlbumArtist))
	}
	if tags.Genre != "" {
		args = append(args, "-metadata", fmt.Sprintf("genre=%s", tags.Genre))
	}
	if tags.Year > 0 {
		args = append(args, "-metadata", fmt.Sprintf("date=%d", tags.Year))
	}
	if tags.TrackNumberStr != "" {
		args = append(args, "-metadata", fmt.Sprintf("track=%s", tags.TrackNumberStr))
	}
	if tags.Producers != "" {
		args = append(args, "-metadata", fmt.Sprintf("composer=%s", tags.Producers))
	}

	args = append(args, "-y", tempPath)

	cmd := exec.Command("ffmpeg", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("ffmpeg failed: %w (%s)", err, strings.TrimSpace(string(output)))
	}

	if _, err := os.Stat(tempPath); os.IsNotExist(err) {
		return fmt.Errorf("temp file was not created")
	}

	if err := os.Rename(tempPath, path); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to replace original file: %w", err)
	}
	return nil
}
