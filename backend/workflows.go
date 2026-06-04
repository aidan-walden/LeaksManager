package backend

import (
	"fmt"
	"log"
	"strings"
)

// --- Complex Workflows ---

// songCreationSpec captures the fully-resolved inputs for creating one song from
// an upload. Both upload flows reduce their per-file decisions to this shape and
// hand it to createSongsFromSpecs, which owns the shared tail: producer matching,
// field extraction, song creation, and metadata write-back.
type songCreationSpec struct {
	Filepath         string
	OriginalFilename string
	Metadata         ExtractedMetadata
	ArtistIDs        []int
	AlbumID          *int
	ArtworkPath      *string
	MatchProducers   bool
}

// resolveUploadArtwork picks the artwork for an uploaded song: embedded artwork
// when requested and present (falling back to none if it can't be saved),
// otherwise the album's artwork.
func (a *App) resolveUploadArtwork(useEmbedded bool, metadata ExtractedMetadata, album *AlbumWithArtists) *string {
	if useEmbedded && metadata.Artwork != nil {
		ext := "jpg"
		if metadata.Artwork.MimeType == "image/png" {
			ext = "png"
		}
		if path, err := a.SaveArtwork(fmt.Sprintf("artwork.%s", ext), metadata.Artwork.Data); err == nil {
			return &path
		}
		return nil
	}
	if album != nil && album.ArtworkPath != nil {
		return album.ArtworkPath
	}
	return nil
}

// createSongsFromSpecs is the shared core of the upload flows. It creates a song
// per spec and writes metadata back to each file. A metadata write failure does
// not abort the batch (the song is already created); it is logged rather than
// silently discarded.
func (a *App) createSongsFromSpecs(specs []songCreationSpec, settings *Settings) ([]Song, error) {
	createdSongs := []Song{}
	for _, spec := range specs {
		var producerIDs []int
		if spec.MatchProducers {
			producerIDs, _ = a.MatchProducersFromFilename(spec.OriginalFilename, spec.ArtistIDs)
		}

		var trackNumber *int
		if !settings.ClearTrackNumberOnUpload && spec.Metadata.TrackNumber > 0 {
			tn := spec.Metadata.TrackNumber
			trackNumber = &tn
		}

		songName := spec.Metadata.Title
		if songName == "" {
			songName = spec.OriginalFilename
		}

		var year *int
		if spec.Metadata.Year > 0 {
			y := spec.Metadata.Year
			year = &y
		}

		var genre *string
		if spec.Metadata.Genre != "" {
			g := spec.Metadata.Genre
			genre = &g
		}

		var duration *float64
		if spec.Metadata.Duration > 0 {
			d := spec.Metadata.Duration
			duration = &d
		}

		song, err := a.CreateSong(CreateSongInput{
			Name:        songName,
			Filepath:    spec.Filepath,
			ArtistIDs:   spec.ArtistIDs,
			ProducerIDs: producerIDs,
			AlbumID:     spec.AlbumID,
			ArtworkPath: spec.ArtworkPath,
			Genre:       genre,
			Year:        year,
			TrackNumber: trackNumber,
			Duration:    duration,
		})
		if err != nil {
			return nil, err
		}

		createdSongs = append(createdSongs, *song)

		// Write metadata back to file. The song exists regardless, so a write
		// failure is logged rather than failing the whole upload.
		if result, _ := a.WriteSongMetadata(song.ID); !result.Success {
			log.Printf("upload: failed to write metadata for song %d (%s): %s", song.ID, spec.Filepath, result.Error)
		}
	}

	return createdSongs, nil
}

// UploadAndExtractMetadata handles the first step of the metadata extraction workflow
func (a *App) UploadAndExtractMetadata(files []FileUpload, albumID *int) (*UploadAndExtractResult, error) {
	var filesData []FileData
	allArtistNames := make(map[string]bool)
	allAlbumNames := make(map[string]bool)
	filesWithArtwork := 0

	for _, file := range files {
		// Save file
		relPath, err := a.SaveUploadedFile(file.Filename, file.Base64Data)
		if err != nil {
			return nil, err
		}

		// Extract metadata
		metadata, err := a.ExtractMetadata(relPath)
		if err != nil {
			metadata = &ExtractedMetadata{} // Continue with empty metadata
		}

		// Parse artists
		parsedArtists := ParseArtists(metadata.Artist)
		for _, artist := range parsedArtists {
			allArtistNames[artist] = true
		}

		// Collect album names if no album ID provided
		if albumID == nil && metadata.Album != "" {
			allAlbumNames[metadata.Album] = true
		}

		if metadata.Artwork != nil {
			filesWithArtwork++
		}

		filesData = append(filesData, FileData{
			OriginalFilename:   file.Filename,
			Filepath:           relPath,
			Metadata:           *metadata,
			ParsedArtists:      parsedArtists,
			HasUnmappedArtists: false,
		})
	}

	// Check which artists exist
	existingArtists := make(map[string]int) // lowercase -> id
	for name := range allArtistNames {
		artist, _ := a.FindArtistByName(name)
		if artist != nil {
			existingArtists[strings.ToLower(name)] = artist.ID
		}
	}

	// Identify unmapped artists
	unmappedArtists := []string{}
	for name := range allArtistNames {
		if _, exists := existingArtists[strings.ToLower(name)]; !exists {
			unmappedArtists = append(unmappedArtists, name)
		}
	}

	// Mark files with unmapped artists
	for i := range filesData {
		for _, artist := range filesData[i].ParsedArtists {
			if _, exists := existingArtists[strings.ToLower(artist)]; !exists {
				filesData[i].HasUnmappedArtists = true
				break
			}
		}
	}

	// Map files to existing albums if no albumID provided
	if albumID == nil {
		for albumName := range allAlbumNames {
			album, _ := a.FindAlbumByName(albumName)
			if album != nil {
				for i := range filesData {
					if strings.EqualFold(filesData[i].Metadata.Album, albumName) {
						filesData[i].AlbumID = &album.ID
					}
				}
			}
		}
	}

	return &UploadAndExtractResult{
		FilesData:        filesData,
		UnmappedArtists:  unmappedArtists,
		FilesWithArtwork: filesWithArtwork,
	}, nil
}

// CreateSongsWithMetadata creates songs from extracted metadata
func (a *App) CreateSongsWithMetadata(input CreateSongsWithMetadataInput) ([]Song, error) {
	settings, err := a.GetSettings()
	if err != nil {
		return nil, fmt.Errorf("failed to load settings: %w", err)
	}

	// Build artist ID map
	artistIDMap := make(map[string]int)
	for artistName, resolution := range input.ArtistMapping {
		if resolution == "CREATE_NEW" {
			newArtist, err := a.CreateArtist(CreateArtistInput{Name: artistName})
			if err != nil {
				return nil, err
			}
			artistIDMap[artistName] = newArtist.ID
		} else if id, ok := resolution.(float64); ok {
			artistIDMap[artistName] = int(id)
		}
	}

	// Also check for existing artists not in mapping
	for _, fileData := range input.FilesData {
		for _, artistName := range fileData.ParsedArtists {
			if _, exists := artistIDMap[artistName]; !exists {
				artist, _ := a.FindArtistByName(artistName)
				if artist != nil {
					artistIDMap[artistName] = artist.ID
				}
			}
		}
	}

	// Get album data for inheritance
	var album *AlbumWithArtists
	if input.AlbumID != nil {
		album, _ = a.GetAlbumWithArtists(*input.AlbumID)
	}

	specs := make([]songCreationSpec, 0, len(input.FilesData))
	for _, fileData := range input.FilesData {
		// Resolve artist IDs
		songArtistIDs := []int{}
		for _, artistName := range fileData.ParsedArtists {
			if id, exists := artistIDMap[artistName]; exists {
				songArtistIDs = append(songArtistIDs, id)
			}
		}

		// Determine album
		currentAlbum := album
		fileAlbumID := fileData.AlbumID
		if currentAlbum == nil && fileAlbumID != nil {
			currentAlbum, _ = a.GetAlbumWithArtists(*fileAlbumID)
		}

		// Use artists from metadata or inherit from album
		finalArtistIDs := songArtistIDs
		if len(finalArtistIDs) == 0 && currentAlbum != nil {
			for _, art := range currentAlbum.Artists {
				finalArtistIDs = append(finalArtistIDs, art.ID)
			}
		}

		// Determine final album ID
		var finalAlbumID *int
		if input.AlbumID != nil {
			finalAlbumID = input.AlbumID
		} else if fileData.AlbumID != nil {
			finalAlbumID = fileData.AlbumID
		}

		specs = append(specs, songCreationSpec{
			Filepath:         fileData.Filepath,
			OriginalFilename: fileData.OriginalFilename,
			Metadata:         fileData.Metadata,
			ArtistIDs:        finalArtistIDs,
			AlbumID:          finalAlbumID,
			ArtworkPath:      a.resolveUploadArtwork(input.UseEmbeddedArtwork, fileData.Metadata, currentAlbum),
			MatchProducers:   true,
		})
	}

	return a.createSongsFromSpecs(specs, settings)
}

// UploadSongs handles simple song upload without metadata preview
func (a *App) UploadSongs(files []FileUpload, albumID *int) ([]Song, error) {
	settings, err := a.GetSettings()
	if err != nil {
		return nil, fmt.Errorf("failed to load settings: %w", err)
	}

	// Get album data for inheritance
	var album *AlbumWithArtists
	artistIDs := []int{}

	if albumID != nil {
		album, _ = a.GetAlbumWithArtists(*albumID)
		if album != nil {
			for _, art := range album.Artists {
				artistIDs = append(artistIDs, art.ID)
			}
		}
	}

	specs := make([]songCreationSpec, 0, len(files))
	for _, file := range files {
		// Save file
		relPath, err := a.SaveUploadedFile(file.Filename, file.Base64Data)
		if err != nil {
			return nil, err
		}

		// Extract metadata
		metadata, _ := a.ExtractMetadata(relPath)
		if metadata == nil {
			metadata = &ExtractedMetadata{}
		}

		specs = append(specs, songCreationSpec{
			Filepath:         relPath,
			OriginalFilename: file.Filename,
			Metadata:         *metadata,
			ArtistIDs:        artistIDs,
			AlbumID:          albumID,
			ArtworkPath:      a.resolveUploadArtwork(false, *metadata, album),
			MatchProducers:   false,
		})
	}

	return a.createSongsFromSpecs(specs, settings)
}
