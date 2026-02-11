package backend

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
	Synced          bool    `json:"synced"`
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
	Synced      bool    `json:"synced"`
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
	Synced      bool     `json:"synced"`
	AppleMusicID *string `json:"appleMusicId"`
}

// SongReadable includes formatted artist string for display
type SongReadable struct {
	Song
	Artist    string     `json:"artist"`
	Artists   []Artist   `json:"artists"`
	Producers []Producer `json:"producers"`
	Album     *Album     `json:"album"`
}

// AppleMusicTrack represents a track in the user's Apple Music library
type AppleMusicTrack struct {
	ID          string  `json:"id"` // Persistent ID
	DatabaseID  int     `json:"databaseId"`
	Name        string  `json:"name"`
	Artist      string  `json:"artist"`
	AlbumArtist string  `json:"albumArtist"`
	Album       string  `json:"album"`
	Genre       string  `json:"genre"`
	Year        int     `json:"year"`
	Duration    float64 `json:"duration"`
	TrackNumber int     `json:"trackNumber"`
	TrackCount  int     `json:"trackCount"`
	DiscNumber  int     `json:"discNumber"`
	DiscCount   int     `json:"discCount"`
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
	Songs              []SongReadable        `json:"songs"`
	SongsCount         int                   `json:"songsCount"`
	Albums             []AlbumWithSongs      `json:"albums"`
	Artists            []ArtistWithRelations `json:"artists"`
	Producers          []ProducerWithAliases `json:"producers"`
	Settings           Settings              `json:"settings"`
	IsMac              bool                  `json:"isMac"`
	Limits             Limits                `json:"limits"`
	HasUnsyncedChanges bool                  `json:"hasUnsyncedChanges"`
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

// SyncResult contains the results of a sync operation
type SyncResult struct {
	TotalSongs   int              `json:"totalSongs"`
	SuccessCount int              `json:"successCount"`
	FailureCount int              `json:"failureCount"`
	AddedCount   int              `json:"addedCount"`   // Tracks added to Apple Music
	UpdatedCount int              `json:"updatedCount"` // Tracks updated in Apple Music
	Results      []SyncItemResult `json:"results"`
	CompletedAt  int64            `json:"completedAt"`
}

// SyncItemResult contains the result for a single song
type SyncItemResult struct {
	SongID       int     `json:"songId"`
	SongName     string  `json:"songName"`
	Status       string  `json:"status"` // "success", "failed", "added", "updated"
	AppleMusicID *string `json:"appleMusicId"`
	ErrorMessage string  `json:"errorMessage,omitempty"`
}

// SyncError tracks sync errors for future error card display
type SyncError struct {
	ID           int    `json:"id"`
	SongID       int    `json:"songId"`
	ErrorMessage string `json:"errorMessage"`
	ErrorType    string `json:"errorType"` // "not_found", "applescript_error", "timeout", etc.
	OccurredAt   int64  `json:"occurredAt"`
}
