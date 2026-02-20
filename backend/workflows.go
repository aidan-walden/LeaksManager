package backend

import (
	"fmt"
	"strings"
)

// --- Complex Workflows ---

// UploadAndExtractMetadata handles the first step of the metadata extraction workflow
func (a *App) UploadAndExtractMetadata(files []struct {
	Filename   string `json:"filename"`
	Base64Data string `json:"base64Data"`
}, albumID *int) (*UploadAndExtractResult, error) {
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

	createdSongs := []Song{}
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

		// Handle artwork
		var artworkPath *string
		if input.UseEmbeddedArtwork && fileData.Metadata.Artwork != nil {
			ext := "jpg"
			if fileData.Metadata.Artwork.MimeType == "image/png" {
				ext = "png"
			}
			path, err := a.SaveArtwork(fmt.Sprintf("artwork.%s", ext), fileData.Metadata.Artwork.Data)
			if err == nil {
				artworkPath = &path
			}
		} else if currentAlbum != nil && currentAlbum.ArtworkPath != nil {
			artworkPath = currentAlbum.ArtworkPath
		}

		// Determine final album ID
		var finalAlbumID *int
		if input.AlbumID != nil {
			finalAlbumID = input.AlbumID
		} else if fileData.AlbumID != nil {
			finalAlbumID = fileData.AlbumID
		}

		// Match producers from filename
		producerIDs, _ := a.MatchProducersFromFilename(fileData.OriginalFilename, finalArtistIDs)

		// Prepare track number
		var trackNumber *int
		if !settings.ClearTrackNumberOnUpload && fileData.Metadata.TrackNumber > 0 {
			trackNumber = &fileData.Metadata.TrackNumber
		}

		// Create song
		songName := fileData.Metadata.Title
		if songName == "" {
			songName = fileData.OriginalFilename
		}

		var year *int
		if fileData.Metadata.Year > 0 {
			year = &fileData.Metadata.Year
		}

		var genre *string
		if fileData.Metadata.Genre != "" {
			genre = &fileData.Metadata.Genre
		}

		var duration *float64
		if fileData.Metadata.Duration > 0 {
			duration = &fileData.Metadata.Duration
		}

		song, err := a.CreateSong(CreateSongInput{
			Name:        songName,
			Filepath:    fileData.Filepath,
			ArtistIDs:   finalArtistIDs,
			ProducerIDs: producerIDs,
			AlbumID:     finalAlbumID,
			ArtworkPath: artworkPath,
			Genre:       genre,
			Year:        year,
			TrackNumber: trackNumber,
			Duration:    duration,
		})
		if err != nil {
			return nil, err
		}

		createdSongs = append(createdSongs, *song)

		// Write metadata back to file
		a.WriteSongMetadata(song.ID)
	}

	return createdSongs, nil
}

// UploadSongs handles simple song upload without metadata preview
func (a *App) UploadSongs(files []struct {
	Filename   string `json:"filename"`
	Base64Data string `json:"base64Data"`
}, albumID *int) ([]Song, error) {
	settings, err := a.GetSettings()
	if err != nil {
		return nil, fmt.Errorf("failed to load settings: %w", err)
	}

	// Get album data for inheritance
	var album *AlbumWithArtists
	var artworkPath *string
	artistIDs := []int{}

	if albumID != nil {
		album, _ = a.GetAlbumWithArtists(*albumID)
		if album != nil {
			artworkPath = album.ArtworkPath
			for _, art := range album.Artists {
				artistIDs = append(artistIDs, art.ID)
			}
		}
	}

	createdSongs := []Song{}
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

		var trackNumber *int
		if !settings.ClearTrackNumberOnUpload && metadata.TrackNumber > 0 {
			trackNumber = &metadata.TrackNumber
		}

		songName := metadata.Title
		if songName == "" {
			songName = file.Filename
		}

		var year *int
		if metadata.Year > 0 {
			year = &metadata.Year
		}

		var genre *string
		if metadata.Genre != "" {
			genre = &metadata.Genre
		}

		var duration *float64
		if metadata.Duration > 0 {
			duration = &metadata.Duration
		}

		song, err := a.CreateSong(CreateSongInput{
			Name:        songName,
			Filepath:    relPath,
			ArtistIDs:   artistIDs,
			AlbumID:     albumID,
			ArtworkPath: artworkPath,
			Genre:       genre,
			Year:        year,
			TrackNumber: trackNumber,
			Duration:    duration,
		})
		if err != nil {
			return nil, err
		}

		createdSongs = append(createdSongs, *song)
		a.WriteSongMetadata(song.ID)
	}

	return createdSongs, nil
}
