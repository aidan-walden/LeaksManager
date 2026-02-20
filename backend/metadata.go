package backend

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/ambeloe/oggv/vorbiscomment"
	"github.com/bogem/id3v2"
	"github.com/dhowden/tag"
	"github.com/go-flac/flacpicture"
	"github.com/go-flac/flacvorbis"
	"github.com/go-flac/go-flac"
)

// --- Metadata Logic ---

type songMetadataWrite struct {
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
	SongArt        string
	AlbumArt       string
}

// ExtractMetadata replaces POST /extract-metadata
func (a *App) ExtractMetadata(relPath string) (*ExtractedMetadata, error) {
	// 1. Resolve Path
	fullPath, err := a.staticFilePath(relPath)
	if err != nil {
		return nil, err
	}

	f, err := os.Open(fullPath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %s", fullPath)
	}
	defer f.Close()

	// 2. Read Metadata using dhowden/tag
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

	// 3. Extract Artwork
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
// Replaces Python ThreadPoolExecutor with Go Routines
func (a *App) WriteAlbumMetadata(albumID int) (BatchResult, error) {
	// 1. Get Songs in Album

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

	// 2. Parallel Processing
	results := make([]SongProcessingResult, len(songIDs))
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 4) // Limit concurrency to 4 workers (like max_workers)

	for i, id := range songIDs {
		wg.Add(1)
		go func(index int, sID int) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// Process
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

	// 3. Aggregate Results
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
	// 1. Query DB (Complex Join converted from Python)
	query := `
    SELECT 
        s.name, s.filepath, s.genre, s.year, s.track_number,
        s.artwork_path, a.name, a.year, a.genre, a.artwork_path,
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
	var sYear, sTrack, aYear sql.NullInt32

	err := a.db.QueryRow(query, songID).Scan(
		&sName, &sPath, &sGenre, &sYear, &sTrack,
		&sArt, &aName, &aYear, &aGenre, &aArt, &artists, &albumArtists, &producers,
	)
	if err == sql.ErrNoRows {
		fmt.Println("song not found")
		return fmt.Errorf("song not found")
	} else if err != nil {
		fmt.Println("error scanning song:", err)
		return err
	}
	_ = aYear

	fullPath, err := a.staticFilePath(sPath)
	if err != nil {
		return err
	}

	songGenre := ""
	if sGenre.Valid {
		songGenre = sGenre.String
	}
	albumGenre := ""
	if aGenre.Valid {
		albumGenre = aGenre.String
	}
	genreToWrite := songGenre
	if genreToWrite == "" {
		genreToWrite = albumGenre
	}

	albumName := ""
	if aName.Valid {
		albumName = aName.String
	}

	songArt := ""
	if sArt.Valid {
		songArt = sArt.String
	}
	albumArt := ""
	if aArt.Valid {
		albumArt = aArt.String
	}

	artistStr := ""
	if artists.Valid {
		artistStr = artists.String
	}
	albumArtistsStr := ""
	if albumArtists.Valid {
		albumArtistsStr = albumArtists.String
	}
	albumArtist := albumArtistsStr
	if albumArtist == "" {
		albumArtist = artistStr
	}

	producersStr := ""
	if producers.Valid {
		producersStr = producers.String
	}

	year := int32(0)
	if sYear.Valid {
		year = sYear.Int32
	}

	trackNumber := int32(0)
	if sTrack.Valid {
		trackNumber = sTrack.Int32
	}

	trackNumberStr := ""
	trackTotal := int32(0)
	settings, err := a.GetSettings()
	if err != nil {
		return err
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
			return countErr
		}

		if trackNumber > 0 {
			if trackTotal > 0 {
				trackNumberStr = fmt.Sprintf("%d/%d", trackNumber, trackTotal)
			} else {
				trackNumberStr = fmt.Sprintf("%d", trackNumber)
			}
		}
	}

	meta := songMetadataWrite{
		Title:          sName,
		Artist:         artistStr,
		AlbumArtist:    albumArtist,
		Album:          albumName,
		Genre:          genreToWrite,
		Year:           year,
		TrackNumberStr: trackNumberStr,
		TrackNumber:    trackNumber,
		TrackTotal:     trackTotal,
		Producers:      producersStr,
		SongArt:        songArt,
		AlbumArt:       albumArt,
	}

	// 2. Embed Metadata based on file extension
	ext := strings.ToLower(filepath.Ext(fullPath))

	switch ext {
	case ".mp3":
		return a.writeMP3Metadata(fullPath, meta)
	case ".flac":
		return a.writeFLACMetadata(fullPath, meta)
	case ".m4a", ".mp4", ".m4b", ".m4p":
		return a.writeM4AMetadata(fullPath, meta)
	case ".ogg", ".oga":
		return a.writeOGGMetadata(fullPath, meta)
	default:
		return fmt.Errorf("writing support for %s not yet implemented", ext)
	}
}

// Logic for MP3s using bogem/id3v2
func (a *App) writeMP3Metadata(path string, meta songMetadataWrite) error {
	tag, err := id3v2.Open(path, id3v2.Options{Parse: true})
	if err != nil {
		return err
	}
	defer tag.Close()

	tag.DeleteAllFrames()

	if meta.Title != "" {
		tag.SetTitle(meta.Title)
	}
	if meta.Artist != "" {
		tag.SetArtist(meta.Artist)
	}
	if meta.AlbumArtist != "" {
		tag.AddTextFrame(tag.CommonID("Band/Orchestra/Accompaniment"), tag.DefaultEncoding(), meta.AlbumArtist)
	}
	if meta.Album != "" {
		tag.SetAlbum(meta.Album)
	}
	if meta.Genre != "" {
		tag.SetGenre(meta.Genre)
	}
	if meta.Year > 0 {
		tag.SetYear(fmt.Sprintf("%d", meta.Year))
	}
	if meta.TrackNumberStr != "" {
		tag.AddTextFrame(tag.CommonID("Track number/Position in set"), tag.DefaultEncoding(), meta.TrackNumberStr)
	}
	if meta.Producers != "" {
		tag.AddTextFrame(tag.CommonID("Composer"), tag.DefaultEncoding(), meta.Producers)
	}

	// Handle Artwork
	artPathToUse := meta.SongArt
	if artPathToUse == "" {
		artPathToUse = meta.AlbumArt
	}

	if artPathToUse != "" {
		fullArtPath, pathErr := a.staticFilePath(artPathToUse)
		if pathErr != nil {
			return pathErr
		}
		artData, err := os.ReadFile(fullArtPath)
		if err == nil {
			mimeType := "image/jpeg"
			if strings.HasSuffix(strings.ToLower(artPathToUse), ".png") {
				mimeType = "image/png"
			}
			pic := id3v2.PictureFrame{
				Encoding:    id3v2.EncodingUTF8,
				MimeType:    mimeType,
				PictureType: id3v2.PTFrontCover,
				Description: "Front Cover",
				Picture:     artData,
			}
			tag.AddAttachedPicture(pic)
		}
	}

	return tag.Save()
}

// logic for flac using go-flac/flacvorbis
func (a *App) writeFLACMetadata(path string, meta songMetadataWrite) error {
	// parse flac file
	f, err := flac.ParseFile(path)
	if err != nil {
		return fmt.Errorf("failed to parse flac file: %w", err)
	}

	// find or create vorbis comment block
	var cmt *flacvorbis.MetaDataBlockVorbisComment
	var cmtIndex = -1

	for i, meta := range f.Meta {
		if meta.Type == flac.VorbisComment {
			cmt, err = flacvorbis.ParseFromMetaDataBlock(*meta)
			if err != nil {
				return fmt.Errorf("failed to parse vorbis comments: %w", err)
			}
			cmtIndex = i
			break
		}
	}

	if cmt == nil {
		// create new vorbis comment block
		cmt = flacvorbis.New()
	}

	// set metadata tags
	cmt.Comments = []string{}
	if meta.Title != "" {
		cmt.Add(flacvorbis.FIELD_TITLE, meta.Title)
	}
	if meta.Artist != "" {
		cmt.Add(flacvorbis.FIELD_ARTIST, meta.Artist)
	}
	if meta.AlbumArtist != "" {
		cmt.Add("ALBUMARTIST", meta.AlbumArtist)
	}
	if meta.Album != "" {
		cmt.Add(flacvorbis.FIELD_ALBUM, meta.Album)
	}
	if meta.Genre != "" {
		cmt.Add(flacvorbis.FIELD_GENRE, meta.Genre)
	}
	if meta.Year > 0 {
		cmt.Add(flacvorbis.FIELD_DATE, fmt.Sprintf("%d", meta.Year))
	}
	if meta.TrackNumberStr != "" {
		cmt.Add(flacvorbis.FIELD_TRACKNUMBER, meta.TrackNumberStr)
	}
	if meta.Producers != "" {
		cmt.Add("PRODUCER", meta.Producers)
	}

	// marshal vorbis comments back to metadata block
	cmtBlock := cmt.Marshal()

	if cmtIndex >= 0 {
		// replace existing vorbis comment block
		f.Meta[cmtIndex] = &cmtBlock
	} else {
		// add new vorbis comment block (must be before picture blocks)
		f.Meta = append(f.Meta, &cmtBlock)
	}

	// handle artwork
	artPathToUse := meta.SongArt
	if artPathToUse == "" {
		artPathToUse = meta.AlbumArt
	}

	if artPathToUse != "" {
		fullArtPath, pathErr := a.staticFilePath(artPathToUse)
		if pathErr != nil {
			return pathErr
		}
		artData, err := os.ReadFile(fullArtPath)
		if err == nil {
			// determine mime type
			mimeType := "image/jpeg"
			if strings.HasSuffix(strings.ToLower(artPathToUse), ".png") {
				mimeType = "image/png"
			}

			// create picture using flacpicture
			picture, err := flacpicture.NewFromImageData(
				flacpicture.PictureTypeFrontCover,
				"Front Cover",
				artData,
				mimeType,
			)
			if err == nil {
				pictureBlock := picture.Marshal()

				// remove existing picture blocks
				newMeta := make([]*flac.MetaDataBlock, 0)
				for _, meta := range f.Meta {
					if meta.Type != flac.Picture {
						newMeta = append(newMeta, meta)
					}
				}

				// add new picture block
				newMeta = append(newMeta, &pictureBlock)
				f.Meta = newMeta
			}
		}
	}

	// save back to file
	return f.Save(path)
}

// logic for m4a using ffmpeg as workaround for go-mp4tag library issues
func (a *App) writeM4AMetadata(path string, meta songMetadataWrite) error {
	fmt.Printf("[M4A] Starting metadata write for: %s\n", path)
	fmt.Printf("[M4A] Metadata to write: Title=%s, Artist=%s, Album=%s, AlbumArtist=%s, Genre=%s, Year=%d, Track=%s, Composer=%s\n",
		meta.Title, meta.Artist, meta.Album, meta.AlbumArtist, meta.Genre, meta.Year, meta.TrackNumberStr, meta.Producers)

	// check if ffmpeg is available
	_, err := exec.LookPath("ffmpeg")
	if err != nil {
		fmt.Printf("[M4A] ERROR: ffmpeg not found in PATH: %v\n", err)
		return fmt.Errorf("ffmpeg not found: %w", err)
	}

	// use ffmpeg to write metadata since go-mp4tag has seek issues
	tempPath := path + ".ffmpeg.m4a"

	// handle artwork
	artPathToUse := meta.SongArt
	if artPathToUse == "" {
		artPathToUse = meta.AlbumArt
	}

	var fullArtPath string
	if artPathToUse != "" {
		fullArtPath, err = a.staticFilePath(artPathToUse)
		if err != nil {
			return err
		}
		fmt.Printf("[M4A] Will embed artwork from: %s\n", fullArtPath)
	}

	// build ffmpeg command with metadata
	// for M4A files, ffmpeg requires -map_metadata -1 to clear old metadata first
	args := []string{
		"-i", path,
	}

	// add artwork as second input if available
	if fullArtPath != "" {
		args = append(args, "-i", fullArtPath)
	}

	args = append(args,
		"-map_metadata", "-1", // clear existing metadata
		"-map", "0:a", // map audio from first input
	)

	// map artwork if present
	if fullArtPath != "" {
		args = append(args,
			"-map", "1:0", // map image from second input
			"-c:a", "copy", // copy audio without re-encoding
			"-c:v", "copy", // copy image without re-encoding
			"-disposition:v:0", "attached_pic", // mark as album art
		)
	} else {
		args = append(args, "-c", "copy") // copy streams without re-encoding
	}

	args = append(args, "-movflags", "+faststart")

	// add metadata arguments
	if meta.Title != "" {
		args = append(args, "-metadata", fmt.Sprintf("title=%s", meta.Title))
		fmt.Printf("[M4A] Adding title: %s\n", meta.Title)
	}
	if meta.Artist != "" {
		args = append(args, "-metadata", fmt.Sprintf("artist=%s", meta.Artist))
		fmt.Printf("[M4A] Adding artist: %s\n", meta.Artist)
	}
	if meta.Album != "" {
		args = append(args, "-metadata", fmt.Sprintf("album=%s", meta.Album))
		fmt.Printf("[M4A] Adding album: %s\n", meta.Album)
	}
	if meta.AlbumArtist != "" {
		args = append(args, "-metadata", fmt.Sprintf("album_artist=%s", meta.AlbumArtist))
		fmt.Printf("[M4A] Adding album_artist: %s\n", meta.AlbumArtist)
	}
	if meta.Genre != "" {
		args = append(args, "-metadata", fmt.Sprintf("genre=%s", meta.Genre))
		fmt.Printf("[M4A] Adding genre: %s\n", meta.Genre)
	}
	if meta.Year > 0 {
		args = append(args, "-metadata", fmt.Sprintf("date=%d", meta.Year))
		fmt.Printf("[M4A] Adding date: %d\n", meta.Year)
	}
	if meta.TrackNumberStr != "" {
		args = append(args, "-metadata", fmt.Sprintf("track=%s", meta.TrackNumberStr))
		fmt.Printf("[M4A] Adding track: %s\n", meta.TrackNumberStr)
	}
	if meta.Producers != "" {
		args = append(args, "-metadata", fmt.Sprintf("composer=%s", meta.Producers))
		fmt.Printf("[M4A] Adding composer: %s\n", meta.Producers)
	}

	args = append(args, "-y", tempPath) // overwrite output file

	fmt.Printf("[M4A] Running: ffmpeg %s\n", strings.Join(args, " "))
	cmd := exec.Command("ffmpeg", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("[M4A] ERROR: ffmpeg failed: %v\nOutput:\n%s\n", err, string(output))
		os.Remove(tempPath)
		return fmt.Errorf("ffmpeg failed: %w", err)
	}

	fmt.Printf("[M4A] ffmpeg output:\n%s\n", string(output))

	// verify temp file was created
	if _, err := os.Stat(tempPath); os.IsNotExist(err) {
		fmt.Printf("[M4A] ERROR: temp file was not created\n")
		return fmt.Errorf("temp file was not created")
	}

	fmt.Printf("[M4A] ffmpeg completed successfully, temp file created\n")

	// get file sizes for verification
	originalInfo, _ := os.Stat(path)
	tempInfo, _ := os.Stat(tempPath)
	fmt.Printf("[M4A] Original file size: %d bytes, Temp file size: %d bytes\n", originalInfo.Size(), tempInfo.Size())

	// replace original file
	fmt.Printf("[M4A] Replacing original file with temp file...\n")
	err = os.Rename(tempPath, path)
	if err != nil {
		fmt.Printf("[M4A] ERROR: Failed to replace original file: %v\n", err)
		os.Remove(tempPath)
		return fmt.Errorf("failed to replace original file: %w", err)
	}

	// verify temp file is gone and original exists
	if _, err := os.Stat(tempPath); !os.IsNotExist(err) {
		fmt.Printf("[M4A] WARNING: Temp file still exists after rename\n")
	} else {
		fmt.Printf("[M4A] Temp file removed successfully\n")
	}

	newInfo, err := os.Stat(path)
	if err != nil {
		fmt.Printf("[M4A] ERROR: Cannot stat replaced file: %v\n", err)
		return fmt.Errorf("cannot stat replaced file: %w", err)
	}
	fmt.Printf("[M4A] Replaced file size: %d bytes\n", newInfo.Size())

	// verify metadata was written by reading it back
	fmt.Printf("[M4A] Verifying metadata was written...\n")
	f, err := os.Open(path)
	if err != nil {
		fmt.Printf("[M4A] WARNING: Cannot open file to verify: %v\n", err)
	} else {
		defer f.Close()
		m, err := tag.ReadFrom(f)
		if err != nil {
			fmt.Printf("[M4A] WARNING: Cannot read metadata to verify: %v\n", err)
		} else {
			fmt.Printf("[M4A] Verified metadata - Title: %s, Artist: %s, Album: %s\n", m.Title(), m.Artist(), m.Album())
		}
	}

	fmt.Printf("[M4A] Metadata write completed successfully\n")
	return nil
}

// logic for ogg vorbis using oggv/vorbiscomment
func (a *App) writeOGGMetadata(path string, meta songMetadataWrite) error {
	// open ogg file
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("failed to open ogg file: %w", err)
	}
	defer file.Close()

	// read vorbis comments
	comments, err := vorbiscomment.ReadOggVorbis(file)
	if err != nil {
		return fmt.Errorf("failed to read vorbis comments: %w", err)
	}
	comments.Comments = []string{}

	// helper function to set a comment value
	setComment := func(key, value string) {
		// remove existing comments with this key
		newComments := make([]string, 0)
		for _, c := range comments.Comments {
			if !strings.HasPrefix(strings.ToUpper(c), strings.ToUpper(key)+"=") {
				newComments = append(newComments, c)
			}
		}
		// add new comment
		newComments = append(newComments, key+"="+value)
		comments.Comments = newComments
	}
	// set metadata tags
	if meta.Title != "" {
		setComment("TITLE", meta.Title)
	}
	if meta.Artist != "" {
		setComment("ARTIST", meta.Artist)
	}
	if meta.AlbumArtist != "" {
		setComment("ALBUMARTIST", meta.AlbumArtist)
	}
	if meta.Album != "" {
		setComment("ALBUM", meta.Album)
	}

	if meta.Genre != "" {
		setComment("GENRE", meta.Genre)
	}

	if meta.Year > 0 {
		setComment("DATE", strconv.Itoa(int(meta.Year)))
	}

	if meta.TrackNumberStr != "" {
		setComment("TRACKNUMBER", meta.TrackNumberStr)
	}

	if meta.Producers != "" {
		setComment("PRODUCER", meta.Producers)
	}

	// handle artwork (base64 encoded in vorbis comments)
	artPathToUse := meta.SongArt
	if artPathToUse == "" {
		artPathToUse = meta.AlbumArt
	}

	if artPathToUse != "" {
		fullArtPath, pathErr := a.staticFilePath(artPathToUse)
		if pathErr != nil {
			return pathErr
		}
		artData, err := os.ReadFile(fullArtPath)
		if err == nil {
			mimeType := "image/jpeg"
			if strings.HasSuffix(strings.ToLower(artPathToUse), ".png") {
				mimeType = "image/png"
			}
			picture, picErr := flacpicture.NewFromImageData(
				flacpicture.PictureTypeFrontCover,
				"Front Cover",
				artData,
				mimeType,
			)
			if picErr == nil {
				pictureBlock := picture.Marshal()
				artBase64 := base64.StdEncoding.EncodeToString(pictureBlock.Data)
				setComment("METADATA_BLOCK_PICTURE", artBase64)
			}
		}
	}

	// close original file
	file.Close()

	// create temp file
	tempPath := path + ".tmp"
	tempFile, err := os.Create(tempPath)
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer tempFile.Close()

	// write updated comments to temp file
	err = vorbiscomment.WriteOggVorbis(tempFile, comments)
	if err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to write vorbis comments: %w", err)
	}

	tempFile.Close()

	// replace original file with temp file
	err = os.Rename(tempPath, path)
	if err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to replace original file: %w", err)
	}

	return nil
}
