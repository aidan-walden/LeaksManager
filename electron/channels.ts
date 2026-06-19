// Single source of truth for the IPC surface (contracts/ipc-channels.md).
// Maps the renderer-facing method name (window.api.<Name>) → channel string.
// preload.ts builds window.api from this; ipc.ts registers a handler per channel.
// Names are PascalCase to match the existing RawWailsAppBindings shape so the
// renderer transport (bindings.ts) needs only a source swap, not a rename.

export const API_CHANNELS: Record<string, string> = {
	// App
	GetInitialData: 'app:initialData',
	// Songs
	CreateSong: 'song:create',
	GetSongReadable: 'song:get',
	GetSongsReadable: 'song:list',
	GetSongsCount: 'song:count',
	// Albums
	CreateAlbum: 'album:create',
	GetAlbumsWithSongs: 'album:listWithSongs',
	GetAlbumWithArtists: 'album:getWithArtists',
	ResolveOrCreateAlbum: 'album:resolveOrCreate',
	FindAlbumByName: 'album:findByName',
	UploadAlbumArt: 'album:uploadArt',
	// Artists
	CreateArtist: 'artist:create',
	GetArtists: 'artist:list',
	GetArtistsWithRelations: 'artist:listWithRelations',
	FindArtistByName: 'artist:findByName',
	// Producers
	CreateProducerWithAliases: 'producer:create',
	GetProducersWithAliases: 'producer:listWithAliases',
	LoadProducerPatterns: 'producer:loadPatterns',
	MatchProducersFromFilename: 'producer:matchFromFilename',
	// Settings
	GetSettings: 'settings:get',
	// Files
	SaveUploadedFile: 'file:saveUpload',
	SaveArtwork: 'file:saveArtwork',
	CleanupFiles: 'file:cleanup',
	// Workflows
	UploadAndExtractMetadata: 'workflow:uploadAndExtract',
	CreateSongsWithMetadata: 'workflow:createWithMetadata',
	UploadSongs: 'workflow:uploadSongs'
};
