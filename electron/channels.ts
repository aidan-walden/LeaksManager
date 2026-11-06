// Single source of truth for the IPC surface (contracts/ipc-channels.md).
// Maps the renderer-facing method name (window.api.<Name>) → channel string.
// preload.ts builds window.api from this; ipc.ts registers a handler per channel.
// Names are PascalCase to match the existing RawIpcBindings shape so the
// renderer reaches the preload bridge without a rename.

export const API_CHANNELS = {
	// App
	GetInitialData: 'app:initialData',
	// Songs
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
	WriteProducerMetadata: 'producer:writeMetadata',
	// Settings
	UpdateSettings: 'settings:update',
	// Metadata
	WriteSongMetadata: 'metadata:writeSong',
	WriteAlbumMetadata: 'metadata:writeAlbum',
	// Files
	CleanupFiles: 'file:cleanup',
	ShowInFileExplorer: 'file:showInExplorer',
	// Workflows
	UploadAndExtractMetadata: 'workflow:uploadAndExtract',
	CreateSongsWithMetadata: 'workflow:createWithMetadata',
	// Song sources
	GetSongSources: 'source:list',
	GetSourceFilters: 'source:filters',
	BrowseSource: 'source:browse',
	DownloadSourceSongs: 'source:download',
	CancelSourceDownload: 'source:cancelDownload',
	// Apple Music (macOS)
	SyncSongsToAppleMusic: 'applemusic:sync'
} as const;

export type ApiName = keyof typeof API_CHANNELS;

// Events that main sends to the renderer. Not invokable, so not part of API_CHANNELS.
export const API_EVENTS = {
	SourceDownloadProgress: 'source:downloadProgress'
} as const;
