// Single source of truth for the IPC surface (contracts/ipc-channels.md).
// Maps the renderer-facing method name (window.api.<Name>) → channel string.
// preload.ts builds window.api from this; ipc.ts registers a handler per channel.
// Names are PascalCase to match the existing RawWailsAppBindings shape so the
// renderer reaches the preload bridge without a rename.

export const API_CHANNELS: Record<string, string> = {
	// App
	GetInitialData: 'app:initialData',
	// Songs
	CreateSong: 'song:create',
	UpdateSong: 'song:update',
	DeleteSong: 'song:delete',
	GetSongsReadable: 'song:list',
	GetSongsCount: 'song:count',
	// Albums
	CreateAlbum: 'album:create',
	UpdateAlbum: 'album:update',
	DeleteAlbum: 'album:delete',
	UploadAlbumArt: 'album:uploadArt',
	// Artists
	CreateArtist: 'artist:create',
	// Producers
	CreateProducerWithAliases: 'producer:create',
	UpdateProducerWithAliases: 'producer:update',
	DeleteProducer: 'producer:delete',
	GetProducersWithAliases: 'producer:listWithAliases',
	WriteProducerMetadata: 'producer:writeMetadata',
	MatchProducersFromFilename: 'producer:matchFromFilename',
	// Settings
	UpdateSettings: 'settings:update',
	// Metadata
	ExtractMetadata: 'metadata:extract',
	WriteSongMetadata: 'metadata:writeSong',
	WriteAlbumMetadata: 'metadata:writeAlbum',
	// Files
	CleanupFiles: 'file:cleanup',
	ShowInFileExplorer: 'file:showInExplorer',
	// Workflows
	UploadAndExtractMetadata: 'workflow:uploadAndExtract',
	CreateSongsWithMetadata: 'workflow:createWithMetadata',
	UploadSongs: 'workflow:uploadSongs',
	// Apple Music (macOS)
	GetAppleMusicLibrary: 'applemusic:getLibrary',
	SyncSongsToAppleMusic: 'applemusic:sync'
};
