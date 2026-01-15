// wails binding stubs - these will be replaced by auto-generated bindings from wails
// in the actual wails build, imports come from wailsjs/go/main/App

import type {
	InitialData,
	Artist,
	CreateArtistInput,
	Album,
	CreateAlbumInput,
	UpdateAlbumInput,
	AlbumWithArtists,
	AlbumWithSongs,
	Song,
	CreateSongInput,
	UpdateSongInput,
	SongReadable,
	Producer,
	CreateProducerInput,
	UpdateProducerInput,
	ProducerWithAliases,
	Settings,
	UpdateSettingsInput,
	ExtractedMetadata,
	SongProcessingResult,
	BatchResult,
	UploadAndExtractResult,
	FileUpload,
	CreateSongsWithMetadataInput
} from './types';

// declare the wails runtime - this gets injected by wails at runtime
declare global {
	interface Window {
		go: {
			main: {
				App: typeof WailsBindings;
			};
		};
	}
}

// binding functions that call into Go
// in development without wails, these will throw errors
// the actual implementation will be provided by wails

function getApp() {
	if (typeof window !== 'undefined' && window.go?.main?.App) {
		return window.go.main.App;
	}
	if (typeof window !== 'undefined') {
		// fall back to stubs when running in a browser-only dev server
		console.warn('Wails runtime not available - using stub bindings.');
	}
	return WailsBindings;
}

// --- Data Loading ---

export async function GetInitialData(): Promise<InitialData> {
	return getApp().GetInitialData();
}

// --- Artist CRUD ---

export async function CreateArtist(input: CreateArtistInput): Promise<Artist> {
	return getApp().CreateArtist(input);
}

export async function GetArtists(): Promise<Artist[]> {
	return getApp().GetArtists();
}

export async function FindArtistByName(name: string): Promise<Artist | null> {
	return getApp().FindArtistByName(name);
}

// --- Album CRUD ---

export async function CreateAlbum(input: CreateAlbumInput): Promise<Album> {
	return getApp().CreateAlbum(input);
}

export async function UpdateAlbum(input: UpdateAlbumInput): Promise<void> {
	return getApp().UpdateAlbum(input);
}

export async function DeleteAlbum(albumId: number): Promise<void> {
	return getApp().DeleteAlbum(albumId);
}

export async function GetAlbumsWithSongs(limit: number, offset: number): Promise<AlbumWithSongs[]> {
	return getApp().GetAlbumsWithSongs(limit, offset);
}

export async function GetAlbumWithArtists(albumId: number): Promise<AlbumWithArtists | null> {
	return getApp().GetAlbumWithArtists(albumId);
}

export async function FindAlbumByName(name: string): Promise<Album | null> {
	return getApp().FindAlbumByName(name);
}

// --- Song CRUD ---

export async function CreateSong(input: CreateSongInput): Promise<Song> {
	return getApp().CreateSong(input);
}

export async function UpdateSong(input: UpdateSongInput): Promise<void> {
	return getApp().UpdateSong(input);
}

export async function DeleteSong(songId: number): Promise<void> {
	return getApp().DeleteSong(songId);
}

export async function GetSongsReadable(limit: number, offset: number): Promise<SongReadable[]> {
	return getApp().GetSongsReadable(limit, offset);
}

export async function GetSongsCount(): Promise<number> {
	return getApp().GetSongsCount();
}

// --- Producer CRUD ---

export async function CreateProducerWithAliases(input: CreateProducerInput): Promise<Producer> {
	return getApp().CreateProducerWithAliases(input);
}

export async function UpdateProducerWithAliases(input: UpdateProducerInput): Promise<Producer> {
	return getApp().UpdateProducerWithAliases(input);
}

export async function DeleteProducer(producerId: number): Promise<void> {
	return getApp().DeleteProducer(producerId);
}

export async function GetProducersWithAliases(): Promise<ProducerWithAliases[]> {
	return getApp().GetProducersWithAliases();
}

export async function MatchProducersFromFilename(
	filename: string,
	songArtistIds: number[]
): Promise<number[]> {
	return getApp().MatchProducersFromFilename(filename, songArtistIds);
}

// --- Settings ---

export async function GetSettings(): Promise<Settings> {
	return getApp().GetSettings();
}

export async function UpdateSettings(input: UpdateSettingsInput): Promise<Settings> {
	return getApp().UpdateSettings(input);
}

// --- File Operations ---

export async function SaveUploadedFile(filename: string, base64Data: string): Promise<string> {
	return getApp().SaveUploadedFile(filename, base64Data);
}

export async function SaveArtwork(filename: string, base64Data: string): Promise<string> {
	return getApp().SaveArtwork(filename, base64Data);
}

export async function DeleteFile(relPath: string): Promise<void> {
	return getApp().DeleteFile(relPath);
}

export async function CleanupFiles(relPaths: string[]): Promise<number> {
	return getApp().CleanupFiles(relPaths);
}

export async function ShowInFileExplorer(relPath: string): Promise<void> {
	return getApp().ShowInFileExplorer(relPath);
}

export async function UploadAlbumArt(
	albumId: number,
	filename: string,
	base64Data: string
): Promise<void> {
	return getApp().UploadAlbumArt(albumId, filename, base64Data);
}

// --- Metadata ---

export async function ExtractMetadata(relPath: string): Promise<ExtractedMetadata> {
	return getApp().ExtractMetadata(relPath);
}

export async function WriteSongMetadata(songId: number): Promise<SongProcessingResult> {
	return getApp().WriteSongMetadata(songId);
}

export async function WriteAlbumMetadata(albumId: number): Promise<BatchResult> {
	return getApp().WriteAlbumMetadata(albumId);
}

export async function WriteProducerMetadata(producerId: number): Promise<BatchResult> {
	return getApp().WriteProducerMetadata(producerId);
}

// --- Complex Workflows ---

export async function UploadAndExtractMetadata(
	files: FileUpload[],
	albumId: number | null
): Promise<UploadAndExtractResult> {
	return getApp().UploadAndExtractMetadata(files, albumId);
}

export async function CreateSongsWithMetadata(
	input: CreateSongsWithMetadataInput
): Promise<Song[]> {
	return getApp().CreateSongsWithMetadata(input);
}

export async function UploadSongs(
	files: FileUpload[],
	albumId: number | null
): Promise<Song[]> {
	return getApp().UploadSongs(files, albumId);
}

// type stub for wails bindings object
const WailsBindings = {
	GetInitialData: () =>
		Promise.resolve({
			songs: [],
			songsCount: 0,
			albums: [],
			artists: [],
			producers: [],
			settings: {
				id: 0,
				clearTrackNumberOnUpload: false,
				importToAppleMusic: false,
				automaticallyMakeSingles: false,
				updatedAt: 0
			},
			isMac: false,
			limits: {
				songsPerPage: 50,
				albumsPerPage: 50
			}
		} as InitialData),
	CreateArtist: (_input: CreateArtistInput) => Promise.resolve({} as Artist),
	GetArtists: () => Promise.resolve([] as Artist[]),
	FindArtistByName: (_name: string) => Promise.resolve(null as Artist | null),
	CreateAlbum: (_input: CreateAlbumInput) => Promise.resolve({} as Album),
	UpdateAlbum: (_input: UpdateAlbumInput) => Promise.resolve(),
	DeleteAlbum: (_albumId: number) => Promise.resolve(),
	GetAlbumsWithSongs: (_limit: number, _offset: number) => Promise.resolve([] as AlbumWithSongs[]),
	GetAlbumWithArtists: (_albumId: number) => Promise.resolve(null as AlbumWithArtists | null),
	FindAlbumByName: (_name: string) => Promise.resolve(null as Album | null),
	CreateSong: (_input: CreateSongInput) => Promise.resolve({} as Song),
	UpdateSong: (_input: UpdateSongInput) => Promise.resolve(),
	DeleteSong: (_songId: number) => Promise.resolve(),
	GetSongsReadable: (_limit: number, _offset: number) => Promise.resolve([] as SongReadable[]),
	GetSongsCount: () => Promise.resolve(0),
	CreateProducerWithAliases: (_input: CreateProducerInput) => Promise.resolve({} as Producer),
	UpdateProducerWithAliases: (_input: UpdateProducerInput) => Promise.resolve({} as Producer),
	DeleteProducer: (_producerId: number) => Promise.resolve(),
	GetProducersWithAliases: () => Promise.resolve([] as ProducerWithAliases[]),
	MatchProducersFromFilename: (_filename: string, _songArtistIds: number[]) =>
		Promise.resolve([] as number[]),
	GetSettings: () => Promise.resolve({} as Settings),
	UpdateSettings: (_input: UpdateSettingsInput) => Promise.resolve({} as Settings),
	SaveUploadedFile: (_filename: string, _base64Data: string) => Promise.resolve(''),
	SaveArtwork: (_filename: string, _base64Data: string) => Promise.resolve(''),
	DeleteFile: (_relPath: string) => Promise.resolve(),
	CleanupFiles: (_relPaths: string[]) => Promise.resolve(0),
	ShowInFileExplorer: (_relPath: string) => Promise.resolve(),
	UploadAlbumArt: (_albumId: number, _filename: string, _base64Data: string) => Promise.resolve(),
	ExtractMetadata: (_relPath: string) => Promise.resolve({} as ExtractedMetadata),
	WriteSongMetadata: (_songId: number) => Promise.resolve({} as SongProcessingResult),
	WriteAlbumMetadata: (_albumId: number) => Promise.resolve({} as BatchResult),
	WriteProducerMetadata: (_producerId: number) => Promise.resolve({} as BatchResult),
	UploadAndExtractMetadata: (_files: FileUpload[], _albumId: number | null) =>
		Promise.resolve({} as UploadAndExtractResult),
	CreateSongsWithMetadata: (_input: CreateSongsWithMetadataInput) => Promise.resolve([] as Song[]),
	UploadSongs: (_files: FileUpload[], _albumId: number | null) => Promise.resolve([] as Song[])
};
