package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Sorrow446/go-mp4tag"
	"github.com/ambeloe/oggv/vorbiscomment"
	"github.com/bogem/id3v2"
	"github.com/dhowden/tag"
	"github.com/go-flac/flacpicture"
	"github.com/go-flac/flacvorbis"
	"github.com/go-flac/go-flac"
	_ "github.com/mattn/go-sqlite3"
)

// --- Domain Models ---

type ArtworkData struct {
	Data     string `json:"data"` // Base64
	MimeType string `json:"mimeType"`
}

type ExtractedMetadata struct {
	Title       string       `json:"title"`
	Artist      string       `json:"artist"`
	AlbumArtist string       `json:"albumArtist"`
	Album       string       `json:"album"`
	Year        int          `json:"year"`
	Genre       string       `json:"genre"`
	TrackNumber int          `json:"trackNumber"`
	Producer    string       `json:"producer"`
	Duration    float64      `json:"duration"`
	Artwork     *ArtworkData `json:"artwork"`
}

type BatchResult struct {
	Success        bool                   `json:"success"`
	Message        string                 `json:"message"`
	SongsProcessed int                    `json:"songsProcessed"`
	SongsFailed    int                    `json:"songsFailed"`
	Results        []SongProcessingResult `json:"results"`
}

type SongProcessingResult struct {
	SongID  int    `json:"songId"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// Artist represents a music artist
type Artist struct {
	ID              int     `json:"id"`
	Name            string  `json:"name"`
	Image           *string `json:"image"`
	CareerStartYear *int    `json:"careerStartYear"`
	CareerEndYear   *int    `json:"careerEndYear"`
	CreatedAt       int64   `json:"createdAt"`
	UpdatedAt       int64   `json:"updatedAt"`
}

// ArtistWithRelations includes albums and songs
type ArtistWithRelations struct {
	Artist
	Albums []Album `json:"albums"`
	Songs  []Song  `json:"songs"`
}

// Album represents a music album
type Album struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	ArtworkPath *string `json:"artworkPath"`
	Genre       *string `json:"genre"`
	Year        *int    `json:"year"`
	CreatedAt   int64   `json:"createdAt"`
	UpdatedAt   int64   `json:"updatedAt"`
}

// AlbumWithArtists includes artist information
type AlbumWithArtists struct {
	Album
	Artists []Artist `json:"artists"`
}

// AlbumWithSongs includes songs and artists
type AlbumWithSongs struct {
	Album
	Artists []Artist `json:"artists"`
	Songs   []Song   `json:"songs"`
}

// Song represents a music track
type Song struct {
	ID          int      `json:"id"`
	Name        string   `json:"name"`
	AlbumID     *int     `json:"albumId"`
	ArtworkPath *string  `json:"artworkPath"`
	Genre       *string  `json:"genre"`
	Year        *int     `json:"year"`
	TrackNumber *int     `json:"trackNumber"`
	Duration    *float64 `json:"duration"`
	Filepath    string   `json:"filepath"`
	FileType    *string  `json:"fileType"`
	CreatedAt   int64    `json:"createdAt"`
	UpdatedAt   int64    `json:"updatedAt"`
}

// SongReadable includes formatted artist string for display
type SongReadable struct {
	Song
	Artist    string     `json:"artist"`
	Artists   []Artist   `json:"artists"`
	Producers []Producer `json:"producers"`
	Album     *Album     `json:"album"`
}

// Producer represents a music producer
type Producer struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

// ProducerAlias represents an alias for a producer
type ProducerAlias struct {
	ID         int    `json:"id"`
	ProducerID int    `json:"producerId"`
	Alias      string `json:"alias"`
	CreatedAt  int64  `json:"createdAt"`
}

// ProducerAliasWithArtists includes artist restrictions
type ProducerAliasWithArtists struct {
	ProducerAlias
	ArtistIDs []int `json:"artistIds"`
}

// ProducerWithAliases includes all aliases
type ProducerWithAliases struct {
	Producer
	Aliases []ProducerAliasWithArtists `json:"aliases"`
	Songs   []Song                     `json:"songs"`
}

// Settings represents application settings
type Settings struct {
	ID                       int   `json:"id"`
	ClearTrackNumberOnUpload bool  `json:"clearTrackNumberOnUpload"`
	ImportToAppleMusic       bool  `json:"importToAppleMusic"`
	AutomaticallyMakeSingles bool  `json:"automaticallyMakeSingles"`
	UpdatedAt                int64 `json:"updatedAt"`
}

// InitialData is the payload returned for the main layout load
type InitialData struct {
	Songs       []SongReadable        `json:"songs"`
	SongsCount  int                   `json:"songsCount"`
	Albums      []AlbumWithSongs      `json:"albums"`
	Artists     []ArtistWithRelations `json:"artists"`
	Producers   []ProducerWithAliases `json:"producers"`
	Settings    Settings              `json:"settings"`
	IsMac       bool                  `json:"isMac"`
	Limits      Limits                `json:"limits"`
}

type Limits struct {
	SongsPerPage  int `json:"songsPerPage"`
	AlbumsPerPage int `json:"albumsPerPage"`
}

// Input types for create/update operations

type CreateArtistInput struct {
	Name            string `json:"name"`
	CareerStartYear *int   `json:"careerStartYear"`
	CareerEndYear   *int   `json:"careerEndYear"`
}

type CreateAlbumInput struct {
	Name      string `json:"name"`
	ArtistIDs []int  `json:"artistIds"`
	Year      *int   `json:"year"`
	Genre     *string `json:"genre"`
}

type UpdateAlbumInput struct {
	ID        int     `json:"id"`
	Name      *string `json:"name"`
	Year      *int    `json:"year"`
	Genre     *string `json:"genre"`
	ArtistIDs []int   `json:"artistIds"`
}

type CreateSongInput struct {
	Name        string   `json:"name"`
	Filepath    string   `json:"filepath"`
	ArtistIDs   []int    `json:"artistIds"`
	ProducerIDs []int    `json:"producerIds"`
	AlbumID     *int     `json:"albumId"`
	ArtworkPath *string  `json:"artworkPath"`
	Genre       *string  `json:"genre"`
	Year        *int     `json:"year"`
	TrackNumber *int     `json:"trackNumber"`
	Duration    *float64 `json:"duration"`
}

type UpdateSongInput struct {
	ID          int    `json:"id"`
	Name        *string `json:"name"`
	AlbumID     *int    `json:"albumId"`
	ArtistIDs   []int   `json:"artistIds"`
	ProducerIDs []int   `json:"producerIds"`
	TrackNumber *int    `json:"trackNumber"`
}

type AliasInput struct {
	Name      string `json:"name"`
	ArtistIDs []int  `json:"artistIds"`
}

type CreateProducerInput struct {
	Name    string       `json:"name"`
	Aliases []AliasInput `json:"aliases"`
}

type UpdateProducerInput struct {
	ID      int          `json:"id"`
	Name    string       `json:"name"`
	Aliases []AliasInput `json:"aliases"`
}

type UpdateSettingsInput struct {
	ClearTrackNumberOnUpload *bool `json:"clearTrackNumberOnUpload"`
	ImportToAppleMusic       *bool `json:"importToAppleMusic"`
	AutomaticallyMakeSingles *bool `json:"automaticallyMakeSingles"`
}

// FileData represents uploaded file data for metadata extraction workflow
type FileData struct {
	OriginalFilename   string            `json:"originalFilename"`
	Filepath           string            `json:"filepath"`
	Metadata           ExtractedMetadata `json:"metadata"`
	ParsedArtists      []string          `json:"parsedArtists"`
	HasUnmappedArtists bool              `json:"hasUnmappedArtists"`
	AlbumID            *int              `json:"albumId"`
}

type UploadAndExtractResult struct {
	FilesData        []FileData `json:"filesData"`
	UnmappedArtists  []string   `json:"unmappedArtists"`
	FilesWithArtwork int        `json:"filesWithArtwork"`
}

type CreateSongsWithMetadataInput struct {
	FilesData          []FileData        `json:"filesData"`
	ArtistMapping      map[string]any    `json:"artistMapping"` // string -> int or "CREATE_NEW"
	AlbumID            *int              `json:"albumId"`
	UseEmbeddedArtwork bool              `json:"useEmbeddedArtwork"`
}

// --- App Structure ---

type App struct {
	ctx        context.Context
	db         *sql.DB
	dbPath     string
	staticPath string
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// determine base paths for database and static files
	// in development: use relative path from project root
	// in production: use user data directory

	// check if running in dev mode (wails dev) vs production build
	// in dev mode, use relative paths; in production, use app data directory
	if _, err := os.Stat("svelte/local.db"); err == nil {
		// development mode - database exists in svelte directory
		a.dbPath = "svelte/local.db"
		a.staticPath = "svelte"
	} else {
		// production mode - use user data directory
		// on macOS: ~/Library/Application Support/leaks-manager
		// on Windows: %APPDATA%/leaks-manager
		// on Linux: ~/.local/share/leaks-manager
		homeDir, _ := os.UserHomeDir()
		var dataDir string
		if runtime.GOOS == "darwin" {
			dataDir = filepath.Join(homeDir, "Library", "Application Support", "leaks-manager")
		} else if runtime.GOOS == "windows" {
			dataDir = filepath.Join(homeDir, "AppData", "Roaming", "leaks-manager")
		} else {
			dataDir = filepath.Join(homeDir, ".local", "share", "leaks-manager")
		}

		// create data directory if it doesn't exist
		os.MkdirAll(dataDir, 0755)
		os.MkdirAll(filepath.Join(dataDir, "uploads", "songs"), 0755)
		os.MkdirAll(filepath.Join(dataDir, "uploads", "artwork"), 0755)

		a.dbPath = filepath.Join(dataDir, "local.db")
		a.staticPath = dataDir

		// copy database from bundle if it doesn't exist
		if _, err := os.Stat(a.dbPath); os.IsNotExist(err) {
			// in production, start with empty database or copy from bundle
			// for now, just let SQLite create it
		}
	}

	// initialize SQLite connection
	// go's sql.DB handles connection pooling automatically (replaces python's thread_local)
	var err error
	a.db, err = sql.Open("sqlite3", a.dbPath)
	if err != nil {
		panic("Failed to connect to database: " + err.Error())
	}
}

func (a *App) shutdown(ctx context.Context) {
	if a.db != nil {
		a.db.Close()
	}
}

// --- Wails Exported Methods ---

// ExtractMetadata replaces POST /extract-metadata
func (a *App) ExtractMetadata(relPath string) (*ExtractedMetadata, error) {
	// 1. Resolve Path
	fullPath := filepath.Join(a.staticPath, relPath)
	
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

	var songIDs []int
	for rows.Next() {
		var id int
		rows.Scan(&id)
		songIDs = append(songIDs, id)
	}

	// 2. Parallel Processing
	results := make([]SongProcessingResult, len(songIDs))
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 4) // Limit concurrency to 4 workers (like max_workers)

	for i, id := range songIDs {
		wg.Add(1)
		go func(index int, sID int) {
			defer wg.Done()
			semaphore <- struct{}{} // Acquire token
			defer func() { <-semaphore }() // Release token

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

// --- Internal Logic ---

func (a *App) writeSongMetadataInternal(songID int) error {
	// 1. Query DB (Complex Join converted from Python)
	query := `
    SELECT 
        s.name, s.filepath, s.genre, s.year, s.track_number,
        s.artwork_path, a.name, a.artwork_path,
        GROUP_CONCAT(ar.name, ', '),
        (SELECT GROUP_CONCAT(p.name, ', ') FROM song_producers sp LEFT JOIN producers p ON sp.producer_id = p.id WHERE sp.song_id = s.id)
    FROM songs s
    LEFT JOIN albums a ON s.album_id = a.id
    LEFT JOIN song_artists sa ON s.id = sa.song_id
    LEFT JOIN artists ar ON sa.artist_id = ar.id
    WHERE s.id = ?
    GROUP BY s.id`

	var sName, sPath, sGenre, sArt, aName, aArt string
	var artists, producers sql.NullString
	var sYear, sTrack sql.NullInt32
	
	err := a.db.QueryRow(query, songID).Scan(
		&sName, &sPath, &sGenre, &sYear, &sTrack,
		&sArt, &aName, &aArt, &artists, &producers,
	)
	if err == sql.ErrNoRows {
		return fmt.Errorf("song not found")
	} else if err != nil {
		return err
	}

	fullPath := filepath.Join(a.staticPath, sPath)
	
	// 2. Embed Metadata based on file extension
	ext := strings.ToLower(filepath.Ext(fullPath))

	switch ext {
	case ".mp3":
		return a.writeMP3Metadata(fullPath, sName, artists.String, aName, sYear.Int32, sTrack.Int32, sArt, aArt)
	case ".flac":
		return a.writeFLACMetadata(fullPath, sName, artists.String, aName, sYear.Int32, sTrack.Int32, sArt, aArt)
	case ".m4a", ".mp4", ".m4b", ".m4p":
		return a.writeM4AMetadata(fullPath, sName, artists.String, aName, sYear.Int32, sTrack.Int32, sArt, aArt)
	case ".ogg", ".oga":
		return a.writeOGGMetadata(fullPath, sName, artists.String, aName, sYear.Int32, sTrack.Int32, sArt, aArt)
	default:
		return fmt.Errorf("writing support for %s not yet implemented", ext)
	}
}

// Logic for MP3s using bogem/id3v2
func (a *App) writeMP3Metadata(path, title, artist, album string, year, track int32, songArt, albumArt string) error {
	tag, err := id3v2.Open(path, id3v2.Options{Parse: true})
	if err != nil {
		return err
	}
	defer tag.Close()

	tag.SetTitle(title)
	tag.SetArtist(artist)
	tag.SetAlbum(album)
	if year > 0 {
		tag.SetYear(fmt.Sprintf("%d", year))
	}
	
	// Handle Artwork
	artPathToUse := songArt
	if artPathToUse == "" {
		artPathToUse = albumArt
	}

	if artPathToUse != "" {
		fullArtPath := filepath.Join(a.staticPath, artPathToUse)
		artData, err := os.ReadFile(fullArtPath)
		if err == nil {
			pic := id3v2.PictureFrame{
				Encoding:    id3v2.EncodingUTF8,
				MimeType:    "image/jpeg", // Simplified detection
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
func (a *App) writeFLACMetadata(path, title, artist, album string, year, track int32, songArt, albumArt string) error {
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
	cmt.Add(flacvorbis.FIELD_TITLE, title)
	cmt.Add(flacvorbis.FIELD_ARTIST, artist)
	cmt.Add(flacvorbis.FIELD_ALBUM, album)
	if year > 0 {
		cmt.Add(flacvorbis.FIELD_DATE, fmt.Sprintf("%d", year))
	}
	if track > 0 {
		cmt.Add(flacvorbis.FIELD_TRACKNUMBER, fmt.Sprintf("%d", track))
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
	artPathToUse := songArt
	if artPathToUse == "" {
		artPathToUse = albumArt
	}

	if artPathToUse != "" {
		fullArtPath := filepath.Join(a.staticPath, artPathToUse)
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

// logic for m4a using go-mp4tag
func (a *App) writeM4AMetadata(path, title, artist, album string, year, track int32, songArt, albumArt string) error {
	// open the m4a file
	mp4File, err := mp4tag.Open(path)
	if err != nil {
		return fmt.Errorf("failed to open m4a file: %w", err)
	}
	defer mp4File.Close()

	// create tags struct
	tags := &mp4tag.MP4Tags{
		Title:  title,
		Artist: artist,
		Album:  album,
	}

	if year > 0 {
		tags.Year = year
	}

	if track > 0 {
		tags.TrackNumber = int16(track)
	}

	// handle artwork
	artPathToUse := songArt
	if artPathToUse == "" {
		artPathToUse = albumArt
	}

	if artPathToUse != "" {
		fullArtPath := filepath.Join(a.staticPath, artPathToUse)
		artData, err := os.ReadFile(fullArtPath)
		if err == nil {
			// determine picture type
			picType := mp4tag.ImageTypeJPEG
			if strings.HasSuffix(strings.ToLower(artPathToUse), ".png") {
				picType = mp4tag.ImageTypePNG
			}

			pic := &mp4tag.MP4Picture{
				Format: picType,
				Data:   artData,
			}
			tags.Pictures = []*mp4tag.MP4Picture{pic}
		}
	}

	// write tags to file
	return mp4File.Write(tags, []string{})
}

// logic for ogg vorbis using oggv/vorbiscomment
func (a *App) writeOGGMetadata(path, title, artist, album string, year, track int32, songArt, albumArt string) error {
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
	setComment("TITLE", title)
	setComment("ARTIST", artist)
	setComment("ALBUM", album)

	if year > 0 {
		setComment("DATE", strconv.Itoa(int(year)))
	}

	if track > 0 {
		setComment("TRACKNUMBER", strconv.Itoa(int(track)))
	}

	// handle artwork (base64 encoded in vorbis comments)
	artPathToUse := songArt
	if artPathToUse == "" {
		artPathToUse = albumArt
	}

	if artPathToUse != "" {
		fullArtPath := filepath.Join(a.staticPath, artPathToUse)
		artData, err := os.ReadFile(fullArtPath)
		if err == nil {
			// encode artwork as base64
			artBase64 := base64.StdEncoding.EncodeToString(artData)
			setComment("METADATA_BLOCK_PICTURE", artBase64)
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

// --- Data Loading ---

// GetInitialData replaces +layout.server.ts load function
func (a *App) GetInitialData() (*InitialData, error) {
	const songsPerPage = 25
	const albumsPerPage = 25

	songs, err := a.GetSongsReadable(songsPerPage, 0)
	if err != nil {
		return nil, err
	}

	songsCount, err := a.GetSongsCount()
	if err != nil {
		return nil, err
	}

	albums, err := a.GetAlbumsWithSongs(albumsPerPage, 0)
	if err != nil {
		return nil, err
	}

	artists, err := a.GetArtistsWithRelations()
	if err != nil {
		return nil, err
	}

	producers, err := a.GetProducersWithAliases()
	if err != nil {
		return nil, err
	}

	settings, err := a.GetSettings()
	if err != nil {
		return nil, err
	}

	return &InitialData{
		Songs:      songs,
		SongsCount: songsCount,
		Albums:     albums,
		Artists:    artists,
		Producers:  producers,
		Settings:   *settings,
		IsMac:      runtime.GOOS == "darwin",
		Limits: Limits{
			SongsPerPage:  songsPerPage,
			AlbumsPerPage: albumsPerPage,
		},
	}, nil
}

// --- Artist CRUD ---

func (a *App) CreateArtist(input CreateArtistInput) (*Artist, error) {
	now := time.Now().Unix()
	result, err := a.db.Exec(
		`INSERT INTO artists (name, career_start_year, career_end_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		input.Name, input.CareerStartYear, input.CareerEndYear, now, now,
	)
	if err != nil {
		return nil, err
	}

	id, _ := result.LastInsertId()
	return &Artist{
		ID:              int(id),
		Name:            input.Name,
		CareerStartYear: input.CareerStartYear,
		CareerEndYear:   input.CareerEndYear,
		CreatedAt:       now,
		UpdatedAt:       now,
	}, nil
}

func (a *App) GetArtists() ([]Artist, error) {
	rows, err := a.db.Query(`SELECT id, name, image, career_start_year, career_end_year, created_at, updated_at FROM artists`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var artists []Artist
	for rows.Next() {
		var art Artist
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&art.ID, &art.Name, &art.Image, &art.CareerStartYear, &art.CareerEndYear, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		art.CreatedAt = createdAt.Int64
		art.UpdatedAt = updatedAt.Int64
		artists = append(artists, art)
	}
	return artists, nil
}

func (a *App) GetArtistsWithRelations() ([]ArtistWithRelations, error) {
	artists, err := a.GetArtists()
	if err != nil {
		return nil, err
	}

	var result []ArtistWithRelations
	for _, art := range artists {
		albums, _ := a.getAlbumsByArtist(art.ID)
		songs, _ := a.getSongsByArtist(art.ID)
		result = append(result, ArtistWithRelations{
			Artist: art,
			Albums: albums,
			Songs:  songs,
		})
	}
	return result, nil
}

func (a *App) FindArtistByName(name string) (*Artist, error) {
	var art Artist
	var createdAt, updatedAt sql.NullInt64
	err := a.db.QueryRow(
		`SELECT id, name, image, career_start_year, career_end_year, created_at, updated_at FROM artists WHERE LOWER(name) = LOWER(?)`,
		name,
	).Scan(&art.ID, &art.Name, &art.Image, &art.CareerStartYear, &art.CareerEndYear, &createdAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	art.CreatedAt = createdAt.Int64
	art.UpdatedAt = updatedAt.Int64
	return &art, nil
}

func (a *App) getAlbumsByArtist(artistID int) ([]Album, error) {
	rows, err := a.db.Query(`
		SELECT a.id, a.name, a.artwork_path, a.genre, a.year, a.created_at, a.updated_at
		FROM albums a
		JOIN album_artists aa ON a.id = aa.album_id
		WHERE aa.artist_id = ?
		ORDER BY aa."order"
	`, artistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var albums []Album
	for rows.Next() {
		var alb Album
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		alb.CreatedAt = createdAt.Int64
		alb.UpdatedAt = updatedAt.Int64
		albums = append(albums, alb)
	}
	return albums, nil
}

func (a *App) getSongsByArtist(artistID int) ([]Song, error) {
	rows, err := a.db.Query(`
		SELECT s.id, s.name, s.album_id, s.artwork_path, s.genre, s.year, s.track_number, s.duration, s.filepath, s.file_type, s.created_at, s.updated_at
		FROM songs s
		JOIN song_artists sa ON s.id = sa.song_id
		WHERE sa.artist_id = ?
		ORDER BY sa."order"
	`, artistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var songs []Song
	for rows.Next() {
		var song Song
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&song.ID, &song.Name, &song.AlbumID, &song.ArtworkPath, &song.Genre, &song.Year, &song.TrackNumber, &song.Duration, &song.Filepath, &song.FileType, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		song.CreatedAt = createdAt.Int64
		song.UpdatedAt = updatedAt.Int64
		songs = append(songs, song)
	}
	return songs, nil
}

// --- Album CRUD ---

func (a *App) CreateAlbum(input CreateAlbumInput) (*Album, error) {
	if len(input.ArtistIDs) == 0 {
		return nil, fmt.Errorf("album must have at least one artist")
	}

	now := time.Now().Unix()
	result, err := a.db.Exec(
		`INSERT INTO albums (name, genre, year, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		input.Name, input.Genre, input.Year, now, now,
	)
	if err != nil {
		return nil, err
	}

	albumID, _ := result.LastInsertId()

	// Link artists
	for i, artistID := range input.ArtistIDs {
		_, err := a.db.Exec(
			`INSERT INTO album_artists (album_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
			albumID, artistID, i, now,
		)
		if err != nil {
			return nil, err
		}
	}

	return &Album{
		ID:        int(albumID),
		Name:      input.Name,
		Genre:     input.Genre,
		Year:      input.Year,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (a *App) UpdateAlbum(input UpdateAlbumInput) error {
	now := time.Now().Unix()

	// Update album
	_, err := a.db.Exec(
		`UPDATE albums SET name = COALESCE(?, name), genre = ?, year = ?, updated_at = ? WHERE id = ?`,
		input.Name, input.Genre, input.Year, now, input.ID,
	)
	if err != nil {
		return err
	}

	// Update artist links
	if len(input.ArtistIDs) > 0 {
		a.db.Exec(`DELETE FROM album_artists WHERE album_id = ?`, input.ID)
		for i, artistID := range input.ArtistIDs {
			a.db.Exec(
				`INSERT INTO album_artists (album_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
				input.ID, artistID, i, now,
			)
		}
	}

	return nil
}

func (a *App) DeleteAlbum(albumID int) error {
	// Unlink songs
	_, err := a.db.Exec(`UPDATE songs SET album_id = NULL WHERE album_id = ?`, albumID)
	if err != nil {
		return err
	}

	// Delete album artist links
	_, err = a.db.Exec(`DELETE FROM album_artists WHERE album_id = ?`, albumID)
	if err != nil {
		return err
	}

	// Delete album
	_, err = a.db.Exec(`DELETE FROM albums WHERE id = ?`, albumID)
	return err
}

func (a *App) GetAlbumsWithSongs(limit, offset int) ([]AlbumWithSongs, error) {
	rows, err := a.db.Query(`
		SELECT id, name, artwork_path, genre, year, created_at, updated_at
		FROM albums
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var albums []AlbumWithSongs
	for rows.Next() {
		var alb Album
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		alb.CreatedAt = createdAt.Int64
		alb.UpdatedAt = updatedAt.Int64

		// Get artists
		artists, _ := a.getArtistsForAlbum(alb.ID)
		// Get songs
		songs, _ := a.getSongsForAlbum(alb.ID)

		albums = append(albums, AlbumWithSongs{
			Album:   alb,
			Artists: artists,
			Songs:   songs,
		})
	}
	return albums, nil
}

func (a *App) GetAlbumWithArtists(albumID int) (*AlbumWithArtists, error) {
	var alb Album
	var createdAt, updatedAt sql.NullInt64
	err := a.db.QueryRow(`
		SELECT id, name, artwork_path, genre, year, created_at, updated_at
		FROM albums WHERE id = ?
	`, albumID).Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &createdAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	alb.CreatedAt = createdAt.Int64
	alb.UpdatedAt = updatedAt.Int64

	artists, _ := a.getArtistsForAlbum(albumID)
	return &AlbumWithArtists{Album: alb, Artists: artists}, nil
}

func (a *App) getArtistsForAlbum(albumID int) ([]Artist, error) {
	rows, err := a.db.Query(`
		SELECT ar.id, ar.name, ar.image, ar.career_start_year, ar.career_end_year, ar.created_at, ar.updated_at
		FROM artists ar
		JOIN album_artists aa ON ar.id = aa.artist_id
		WHERE aa.album_id = ?
		ORDER BY aa."order"
	`, albumID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var artists []Artist
	for rows.Next() {
		var art Artist
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&art.ID, &art.Name, &art.Image, &art.CareerStartYear, &art.CareerEndYear, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		art.CreatedAt = createdAt.Int64
		art.UpdatedAt = updatedAt.Int64
		artists = append(artists, art)
	}
	return artists, nil
}

func (a *App) getSongsForAlbum(albumID int) ([]Song, error) {
	rows, err := a.db.Query(`
		SELECT id, name, album_id, artwork_path, genre, year, track_number, duration, filepath, file_type, created_at, updated_at
		FROM songs WHERE album_id = ?
		ORDER BY track_number, created_at
	`, albumID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var songs []Song
	for rows.Next() {
		var song Song
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&song.ID, &song.Name, &song.AlbumID, &song.ArtworkPath, &song.Genre, &song.Year, &song.TrackNumber, &song.Duration, &song.Filepath, &song.FileType, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		song.CreatedAt = createdAt.Int64
		song.UpdatedAt = updatedAt.Int64
		songs = append(songs, song)
	}
	return songs, nil
}

func (a *App) FindAlbumByName(name string) (*Album, error) {
	var alb Album
	var createdAt, updatedAt sql.NullInt64
	err := a.db.QueryRow(
		`SELECT id, name, artwork_path, genre, year, created_at, updated_at FROM albums WHERE LOWER(name) = LOWER(?)`,
		name,
	).Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &createdAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	alb.CreatedAt = createdAt.Int64
	alb.UpdatedAt = updatedAt.Int64
	return &alb, nil
}

// --- Song CRUD ---

func (a *App) CreateSong(input CreateSongInput) (*Song, error) {
	now := time.Now().Unix()
	result, err := a.db.Exec(
		`INSERT INTO songs (name, filepath, album_id, artwork_path, genre, year, track_number, duration, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		input.Name, input.Filepath, input.AlbumID, input.ArtworkPath, input.Genre, input.Year, input.TrackNumber, input.Duration, now, now,
	)
	if err != nil {
		return nil, err
	}

	songID, _ := result.LastInsertId()

	// Link artists
	for i, artistID := range input.ArtistIDs {
		a.db.Exec(
			`INSERT INTO song_artists (song_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
			songID, artistID, i, now,
		)
	}

	// Link producers
	for i, producerID := range input.ProducerIDs {
		a.db.Exec(
			`INSERT INTO song_producers (song_id, producer_id, "order", created_at) VALUES (?, ?, ?, ?)`,
			songID, producerID, i, now,
		)
	}

	return &Song{
		ID:          int(songID),
		Name:        input.Name,
		Filepath:    input.Filepath,
		AlbumID:     input.AlbumID,
		ArtworkPath: input.ArtworkPath,
		Genre:       input.Genre,
		Year:        input.Year,
		TrackNumber: input.TrackNumber,
		Duration:    input.Duration,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (a *App) UpdateSong(input UpdateSongInput) error {
	now := time.Now().Unix()

	// Update song
	_, err := a.db.Exec(
		`UPDATE songs SET name = COALESCE(?, name), album_id = ?, track_number = ?, updated_at = ? WHERE id = ?`,
		input.Name, input.AlbumID, input.TrackNumber, now, input.ID,
	)
	if err != nil {
		return err
	}

	// Update artist links
	if input.ArtistIDs != nil {
		a.db.Exec(`DELETE FROM song_artists WHERE song_id = ?`, input.ID)
		for i, artistID := range input.ArtistIDs {
			a.db.Exec(
				`INSERT INTO song_artists (song_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
				input.ID, artistID, i, now,
			)
		}
	}

	// Update producer links
	if input.ProducerIDs != nil {
		a.db.Exec(`DELETE FROM song_producers WHERE song_id = ?`, input.ID)
		for i, producerID := range input.ProducerIDs {
			a.db.Exec(
				`INSERT INTO song_producers (song_id, producer_id, "order", created_at) VALUES (?, ?, ?, ?)`,
				input.ID, producerID, i, now,
			)
		}
	}

	return nil
}

func (a *App) DeleteSong(songID int) error {
	// Get filepath first
	var songFilepath string
	err := a.db.QueryRow(`SELECT filepath FROM songs WHERE id = ?`, songID).Scan(&songFilepath)
	if err != nil {
		return err
	}

	// Delete song from DB
	_, err = a.db.Exec(`DELETE FROM songs WHERE id = ?`, songID)
	if err != nil {
		return err
	}

	// Delete file from disk
	if songFilepath != "" {
		fullPath := filepath.Join(a.staticPath, songFilepath)
		os.Remove(fullPath)
	}

	return nil
}

func (a *App) GetSongsReadable(limit, offset int) ([]SongReadable, error) {
	rows, err := a.db.Query(`
		SELECT id, name, album_id, artwork_path, genre, year, track_number, duration, filepath, file_type, created_at, updated_at
		FROM songs
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var songs []SongReadable
	for rows.Next() {
		var song Song
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&song.ID, &song.Name, &song.AlbumID, &song.ArtworkPath, &song.Genre, &song.Year, &song.TrackNumber, &song.Duration, &song.Filepath, &song.FileType, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		song.CreatedAt = createdAt.Int64
		song.UpdatedAt = updatedAt.Int64

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

		songs = append(songs, SongReadable{
			Song:      song,
			Artist:    strings.Join(artistNames, ", "),
			Artists:   artists,
			Producers: producers,
			Album:     album,
		})
	}
	return songs, nil
}

func (a *App) GetSongsCount() (int, error) {
	var count int
	err := a.db.QueryRow(`SELECT COUNT(*) FROM songs`).Scan(&count)
	return count, err
}

func (a *App) getArtistsForSong(songID int) ([]Artist, error) {
	rows, err := a.db.Query(`
		SELECT ar.id, ar.name, ar.image, ar.career_start_year, ar.career_end_year, ar.created_at, ar.updated_at
		FROM artists ar
		JOIN song_artists sa ON ar.id = sa.artist_id
		WHERE sa.song_id = ?
		ORDER BY sa."order"
	`, songID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var artists []Artist
	for rows.Next() {
		var art Artist
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&art.ID, &art.Name, &art.Image, &art.CareerStartYear, &art.CareerEndYear, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		art.CreatedAt = createdAt.Int64
		art.UpdatedAt = updatedAt.Int64
		artists = append(artists, art)
	}
	return artists, nil
}

func (a *App) getProducersForSong(songID int) ([]Producer, error) {
	rows, err := a.db.Query(`
		SELECT p.id, p.name, p.created_at, p.updated_at
		FROM producers p
		JOIN song_producers sp ON p.id = sp.producer_id
		WHERE sp.song_id = ?
		ORDER BY sp."order"
	`, songID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var producers []Producer
	for rows.Next() {
		var prod Producer
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&prod.ID, &prod.Name, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		prod.CreatedAt = createdAt.Int64
		prod.UpdatedAt = updatedAt.Int64
		producers = append(producers, prod)
	}
	return producers, nil
}

func (a *App) getAlbumByID(albumID int) (*Album, error) {
	var alb Album
	var createdAt, updatedAt sql.NullInt64
	err := a.db.QueryRow(`
		SELECT id, name, artwork_path, genre, year, created_at, updated_at
		FROM albums WHERE id = ?
	`, albumID).Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &createdAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	alb.CreatedAt = createdAt.Int64
	alb.UpdatedAt = updatedAt.Int64
	return &alb, nil
}

// --- Producer CRUD ---

func (a *App) CreateProducerWithAliases(input CreateProducerInput) (*Producer, error) {
	now := time.Now().Unix()

	// Check alias uniqueness
	for _, alias := range input.Aliases {
		var exists int
		a.db.QueryRow(`SELECT COUNT(*) FROM producer_aliases WHERE LOWER(alias) = LOWER(?)`, alias.Name).Scan(&exists)
		if exists > 0 {
			return nil, fmt.Errorf("alias \"%s\" already exists for another producer", alias.Name)
		}
	}

	result, err := a.db.Exec(
		`INSERT INTO producers (name, created_at, updated_at) VALUES (?, ?, ?)`,
		input.Name, now, now,
	)
	if err != nil {
		return nil, err
	}

	producerID, _ := result.LastInsertId()

	// Create aliases
	for _, alias := range input.Aliases {
		aliasResult, err := a.db.Exec(
			`INSERT INTO producer_aliases (producer_id, alias, created_at) VALUES (?, ?, ?)`,
			producerID, alias.Name, now,
		)
		if err != nil {
			return nil, err
		}

		aliasID, _ := aliasResult.LastInsertId()

		// Create artist restrictions
		for _, artistID := range alias.ArtistIDs {
			a.db.Exec(
				`INSERT INTO producer_alias_artists (alias_id, artist_id, created_at) VALUES (?, ?, ?)`,
				aliasID, artistID, now,
			)
		}
	}

	return &Producer{
		ID:        int(producerID),
		Name:      input.Name,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (a *App) UpdateProducerWithAliases(input UpdateProducerInput) (*Producer, error) {
	now := time.Now().Unix()

	// Check alias uniqueness (excluding current producer)
	for _, alias := range input.Aliases {
		var conflictID int
		err := a.db.QueryRow(`
			SELECT pa.producer_id FROM producer_aliases pa
			WHERE LOWER(pa.alias) = LOWER(?) AND pa.producer_id != ?
		`, alias.Name, input.ID).Scan(&conflictID)
		if err == nil {
			return nil, fmt.Errorf("alias \"%s\" already exists for another producer", alias.Name)
		}
	}

	// Update producer name
	_, err := a.db.Exec(`UPDATE producers SET name = ?, updated_at = ? WHERE id = ?`, input.Name, now, input.ID)
	if err != nil {
		return nil, err
	}

	// Delete existing aliases and their artist restrictions
	rows, _ := a.db.Query(`SELECT id FROM producer_aliases WHERE producer_id = ?`, input.ID)
	var aliasIDs []int
	for rows.Next() {
		var id int
		rows.Scan(&id)
		aliasIDs = append(aliasIDs, id)
	}
	rows.Close()

	for _, aliasID := range aliasIDs {
		a.db.Exec(`DELETE FROM producer_alias_artists WHERE alias_id = ?`, aliasID)
	}
	a.db.Exec(`DELETE FROM producer_aliases WHERE producer_id = ?`, input.ID)

	// Create new aliases
	for _, alias := range input.Aliases {
		aliasResult, err := a.db.Exec(
			`INSERT INTO producer_aliases (producer_id, alias, created_at) VALUES (?, ?, ?)`,
			input.ID, alias.Name, now,
		)
		if err != nil {
			return nil, err
		}

		aliasID, _ := aliasResult.LastInsertId()

		for _, artistID := range alias.ArtistIDs {
			a.db.Exec(
				`INSERT INTO producer_alias_artists (alias_id, artist_id, created_at) VALUES (?, ?, ?)`,
				aliasID, artistID, now,
			)
		}
	}

	return &Producer{
		ID:        input.ID,
		Name:      input.Name,
		CreatedAt: now, // Note: This is not accurate, but we don't query for original
		UpdatedAt: now,
	}, nil
}

func (a *App) DeleteProducer(producerID int) error {
	_, err := a.db.Exec(`DELETE FROM producers WHERE id = ?`, producerID)
	return err
}

func (a *App) GetProducersWithAliases() ([]ProducerWithAliases, error) {
	rows, err := a.db.Query(`SELECT id, name, created_at, updated_at FROM producers`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var producers []ProducerWithAliases
	for rows.Next() {
		var prod Producer
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&prod.ID, &prod.Name, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		prod.CreatedAt = createdAt.Int64
		prod.UpdatedAt = updatedAt.Int64

		aliases, _ := a.getAliasesForProducer(prod.ID)
		songs, _ := a.getSongsForProducer(prod.ID)

		producers = append(producers, ProducerWithAliases{
			Producer: prod,
			Aliases:  aliases,
			Songs:    songs,
		})
	}
	return producers, nil
}

func (a *App) getAliasesForProducer(producerID int) ([]ProducerAliasWithArtists, error) {
	rows, err := a.db.Query(`
		SELECT id, producer_id, alias, created_at FROM producer_aliases WHERE producer_id = ?
	`, producerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var aliases []ProducerAliasWithArtists
	for rows.Next() {
		var alias ProducerAlias
		var createdAt sql.NullInt64
		err := rows.Scan(&alias.ID, &alias.ProducerID, &alias.Alias, &createdAt)
		if err != nil {
			return nil, err
		}
		alias.CreatedAt = createdAt.Int64

		// Get artist IDs for this alias
		artistRows, _ := a.db.Query(`SELECT artist_id FROM producer_alias_artists WHERE alias_id = ?`, alias.ID)
		var artistIDs []int
		for artistRows.Next() {
			var artistID int
			artistRows.Scan(&artistID)
			artistIDs = append(artistIDs, artistID)
		}
		artistRows.Close()

		aliases = append(aliases, ProducerAliasWithArtists{
			ProducerAlias: alias,
			ArtistIDs:     artistIDs,
		})
	}
	return aliases, nil
}

func (a *App) getSongsForProducer(producerID int) ([]Song, error) {
	rows, err := a.db.Query(`
		SELECT s.id, s.name, s.album_id, s.artwork_path, s.genre, s.year, s.track_number, s.duration, s.filepath, s.file_type, s.created_at, s.updated_at
		FROM songs s
		JOIN song_producers sp ON s.id = sp.song_id
		WHERE sp.producer_id = ?
	`, producerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var songs []Song
	for rows.Next() {
		var song Song
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&song.ID, &song.Name, &song.AlbumID, &song.ArtworkPath, &song.Genre, &song.Year, &song.TrackNumber, &song.Duration, &song.Filepath, &song.FileType, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		song.CreatedAt = createdAt.Int64
		song.UpdatedAt = updatedAt.Int64
		songs = append(songs, song)
	}
	return songs, nil
}

// WriteProducerMetadata writes metadata to all songs by a producer
func (a *App) WriteProducerMetadata(producerID int) (BatchResult, error) {
	rows, err := a.db.Query(`SELECT song_id FROM song_producers WHERE producer_id = ?`, producerID)
	if err != nil {
		return BatchResult{}, err
	}
	defer rows.Close()

	var songIDs []int
	for rows.Next() {
		var id int
		rows.Scan(&id)
		songIDs = append(songIDs, id)
	}

	// Parallel processing
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
		Message:        fmt.Sprintf("Processed producer %d", producerID),
		SongsProcessed: successCount,
		SongsFailed:    failCount,
		Results:        results,
	}, nil
}

// --- Settings ---

func (a *App) GetSettings() (*Settings, error) {
	var s Settings
	var updatedAt sql.NullInt64
	err := a.db.QueryRow(`
		SELECT id, clear_track_number_on_upload, import_to_apple_music, automatically_make_singles, updated_at
		FROM settings WHERE id = 1
	`).Scan(&s.ID, &s.ClearTrackNumberOnUpload, &s.ImportToAppleMusic, &s.AutomaticallyMakeSingles, &updatedAt)

	if err == sql.ErrNoRows {
		// Initialize default settings
		now := time.Now().Unix()
		a.db.Exec(`INSERT INTO settings (id, clear_track_number_on_upload, import_to_apple_music, automatically_make_singles, updated_at) VALUES (1, 0, 0, 0, ?)`, now)
		return &Settings{ID: 1, UpdatedAt: now}, nil
	}
	if err != nil {
		return nil, err
	}
	s.UpdatedAt = updatedAt.Int64
	return &s, nil
}

func (a *App) UpdateSettings(input UpdateSettingsInput) (*Settings, error) {
	now := time.Now().Unix()

	// Build dynamic update
	if input.ClearTrackNumberOnUpload != nil {
		a.db.Exec(`UPDATE settings SET clear_track_number_on_upload = ? WHERE id = 1`, *input.ClearTrackNumberOnUpload)
	}
	if input.ImportToAppleMusic != nil {
		a.db.Exec(`UPDATE settings SET import_to_apple_music = ? WHERE id = 1`, *input.ImportToAppleMusic)
	}
	if input.AutomaticallyMakeSingles != nil {
		a.db.Exec(`UPDATE settings SET automatically_make_singles = ? WHERE id = 1`, *input.AutomaticallyMakeSingles)
	}
	a.db.Exec(`UPDATE settings SET updated_at = ? WHERE id = 1`, now)

	return a.GetSettings()
}

// --- File Operations ---

func (a *App) SaveUploadedFile(filename string, base64Data string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %v", err)
	}

	timestampedName := fmt.Sprintf("%d-%s", time.Now().UnixMilli(), filename)
	relPath := fmt.Sprintf("/uploads/songs/%s", timestampedName)
	fullPath := filepath.Join(a.staticPath, relPath)

	err = os.WriteFile(fullPath, data, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to write file: %v", err)
	}

	return relPath, nil
}

func (a *App) SaveArtwork(filename string, base64Data string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %v", err)
	}

	timestampedName := fmt.Sprintf("%d-%s", time.Now().UnixMilli(), filename)
	relPath := fmt.Sprintf("/uploads/artwork/%s", timestampedName)
	fullPath := filepath.Join(a.staticPath, relPath)

	err = os.WriteFile(fullPath, data, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to write file: %v", err)
	}

	return relPath, nil
}

func (a *App) DeleteFile(relPath string) error {
	fullPath := filepath.Join(a.staticPath, relPath)
	return os.Remove(fullPath)
}

func (a *App) CleanupFiles(relPaths []string) int {
	deleted := 0
	for _, relPath := range relPaths {
		if a.DeleteFile(relPath) == nil {
			deleted++
		}
	}
	return deleted
}

func (a *App) UploadAlbumArt(albumID int, filename string, base64Data string) error {
	relPath, err := a.SaveArtwork(filename, base64Data)
	if err != nil {
		return err
	}

	_, err = a.db.Exec(`UPDATE albums SET artwork_path = ? WHERE id = ?`, relPath, albumID)
	return err
}

// --- Utility Functions ---

// ParseArtists splits an artist string by common delimiters
func ParseArtists(artistString string) []string {
	if strings.TrimSpace(artistString) == "" {
		return []string{}
	}

	// Split by: comma, ampersand, semicolon, feat., ft., featuring
	re := regexp.MustCompile(`[,&;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+`)
	parts := re.Split(artistString, -1)

	// Deduplicate while preserving order
	seen := make(map[string]bool)
	var result []string
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			result = append(result, trimmed)
		}
	}
	return result
}

// MatchProducersFromFilename matches producers based on filename patterns
func (a *App) MatchProducersFromFilename(filename string, songArtistIDs []int) ([]int, error) {
	// Remove file extension and normalize
	nameWithoutExt := strings.ToLower(regexp.MustCompile(`\.[^/.]+$`).ReplaceAllString(filename, ""))

	// Get all producers with aliases
	producers, err := a.GetProducersWithAliases()
	if err != nil {
		return nil, err
	}

	// Build searchable terms
	type searchTerm struct {
		term          string
		producerID    int
		isAlias       bool
		aliasArtistIDs []int
	}
	var searchableTerms []searchTerm

	for _, prod := range producers {
		// Add producer name
		searchableTerms = append(searchableTerms, searchTerm{
			term:       strings.ToLower(prod.Name),
			producerID: prod.ID,
			isAlias:    false,
		})

		// Add aliases
		for _, alias := range prod.Aliases {
			searchableTerms = append(searchableTerms, searchTerm{
				term:           strings.ToLower(alias.Alias),
				producerID:     prod.ID,
				isAlias:        true,
				aliasArtistIDs: alias.ArtistIDs,
			})
		}
	}

	// Sort by length (longest first)
	for i := 0; i < len(searchableTerms)-1; i++ {
		for j := i + 1; j < len(searchableTerms); j++ {
			if len(searchableTerms[j].term) > len(searchableTerms[i].term) {
				searchableTerms[i], searchableTerms[j] = searchableTerms[j], searchableTerms[i]
			}
		}
	}

	matchedIDs := make(map[int]bool)
	consumedRanges := make([]struct{ start, end int }, 0)

	isArtistContextValid := func(aliasArtistIDs []int) bool {
		if len(aliasArtistIDs) == 0 {
			return true // Global alias
		}
		if len(songArtistIDs) == 0 {
			return false
		}
		for _, aid := range songArtistIDs {
			for _, aaid := range aliasArtistIDs {
				if aid == aaid {
					return true
				}
			}
		}
		return false
	}

	isRangeConsumed := func(start, end int) bool {
		for _, r := range consumedRanges {
			if (start >= r.start && start < r.end) || (end > r.start && end <= r.end) || (start <= r.start && end >= r.end) {
				return true
			}
		}
		return false
	}

	// Pass 1: exact matches with word boundaries
	for _, st := range searchableTerms {
		if st.isAlias && !isArtistContextValid(st.aliasArtistIDs) {
			continue
		}

		escapedTerm := regexp.QuoteMeta(st.term)
		re := regexp.MustCompile(`\b` + escapedTerm + `\b`)
		matches := re.FindAllStringIndex(nameWithoutExt, -1)

		for _, match := range matches {
			if !isRangeConsumed(match[0], match[1]) {
				matchedIDs[st.producerID] = true
				consumedRanges = append(consumedRanges, struct{ start, end int }{match[0], match[1]})
			}
		}
	}

	// Pass 2: partial matches
	for _, st := range searchableTerms {
		if st.isAlias && !isArtistContextValid(st.aliasArtistIDs) {
			continue
		}

		idx := strings.Index(nameWithoutExt, st.term)
		if idx != -1 {
			start := idx
			end := idx + len(st.term)
			if !isRangeConsumed(start, end) {
				matchedIDs[st.producerID] = true
				consumedRanges = append(consumedRanges, struct{ start, end int }{start, end})
			}
		}
	}

	var result []int
	for id := range matchedIDs {
		result = append(result, id)
	}
	return result, nil
}

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
	var unmappedArtists []string
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
	settings, _ := a.GetSettings()

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

	var createdSongs []Song
	for _, fileData := range input.FilesData {
		// Resolve artist IDs
		var songArtistIDs []int
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
	settings, _ := a.GetSettings()

	// Get album data for inheritance
	var album *AlbumWithArtists
	var artworkPath *string
	var artistIDs []int

	if albumID != nil {
		album, _ = a.GetAlbumWithArtists(*albumID)
		if album != nil {
			artworkPath = album.ArtworkPath
			for _, art := range album.Artists {
				artistIDs = append(artistIDs, art.ID)
			}
		}
	}

	var createdSongs []Song
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
