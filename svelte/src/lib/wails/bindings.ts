import type {
	Album,
	AlbumArtUploadRequest,
	AlbumWithArtists,
	AlbumWithSongs,
	Artist,
	BatchResult,
	CreateAlbumInput,
	CreateArtistInput,
	CreateProducerInput,
	CreateSongInput,
	CreateSongsWithMetadataInput,
	ExtractedMetadata,
	FileUpload,
	FileUploadRequest,
	InitialData,
	PageRequest,
	Producer,
	ProducerWithAliases,
	Settings,
	Song,
	SongBatchUploadRequest,
	SongProcessingResult,
	SongReadable,
	SyncResult,
	UpdateAlbumInput,
	UpdateProducerInput,
	UpdateSettingsInput,
	UpdateSongInput,
	UploadAndExtractResult
} from './types';

declare global {
	interface Window {
		go: {
			backend: {
				App: RawWailsAppBindings;
			};
		};
	}
}

export type RawWailsAppBindings = {
	GetInitialData(): Promise<InitialData>;
	CreateArtist(input: CreateArtistInput): Promise<Artist>;
	GetArtists(): Promise<Artist[]>;
	FindArtistByName(name: string): Promise<Artist | null>;
	CreateAlbum(input: CreateAlbumInput): Promise<Album>;
	UpdateAlbum(input: UpdateAlbumInput): Promise<void>;
	DeleteAlbum(albumId: number): Promise<void>;
	GetAlbumsWithSongs(limit: number, offset: number): Promise<AlbumWithSongs[]>;
	GetAlbumWithArtists(albumId: number): Promise<AlbumWithArtists | null>;
	FindAlbumByName(name: string): Promise<Album | null>;
	CreateSong(input: CreateSongInput): Promise<Song>;
	UpdateSong(input: UpdateSongInput): Promise<void>;
	DeleteSong(songId: number): Promise<void>;
	GetSongsReadable(limit: number, offset: number): Promise<SongReadable[]>;
	GetSongsCount(): Promise<number>;
	CreateProducerWithAliases(input: CreateProducerInput): Promise<Producer>;
	UpdateProducerWithAliases(input: UpdateProducerInput): Promise<Producer>;
	DeleteProducer(producerId: number): Promise<void>;
	GetProducersWithAliases(): Promise<ProducerWithAliases[]>;
	MatchProducersFromFilename(filename: string, songArtistIds: number[]): Promise<number[]>;
	GetSettings(): Promise<Settings>;
	UpdateSettings(input: UpdateSettingsInput): Promise<Settings>;
	SaveUploadedFile(filename: string, base64Data: string): Promise<string>;
	SaveArtwork(filename: string, base64Data: string): Promise<string>;
	DeleteFile(relPath: string): Promise<void>;
	CleanupFiles(relPaths: string[]): Promise<number>;
	ShowInFileExplorer(relPath: string): Promise<void>;
	UploadAlbumArt(albumId: number, filename: string, base64Data: string): Promise<void>;
	ExtractMetadata(relPath: string): Promise<ExtractedMetadata>;
	WriteSongMetadata(songId: number): Promise<SongProcessingResult>;
	WriteAlbumMetadata(albumId: number): Promise<BatchResult>;
	WriteProducerMetadata(producerId: number): Promise<BatchResult>;
	UploadAndExtractMetadata(
		files: FileUpload[],
		albumId: number | null
	): Promise<UploadAndExtractResult>;
	CreateSongsWithMetadata(input: CreateSongsWithMetadataInput): Promise<Song[]>;
	UploadSongs(files: FileUpload[], albumId: number | null): Promise<Song[]>;
	SyncSongsToAppleMusic(): Promise<SyncResult>;
};

export type WailsTransport = {
	getInitialData(): Promise<InitialData>;
	createArtist(input: CreateArtistInput): Promise<Artist>;
	getArtists(): Promise<Artist[]>;
	findArtistByName(name: string): Promise<Artist | null>;
	createAlbum(input: CreateAlbumInput): Promise<Album>;
	updateAlbum(input: UpdateAlbumInput): Promise<void>;
	deleteAlbum(albumId: number): Promise<void>;
	getAlbumsWithSongs(request: PageRequest): Promise<AlbumWithSongs[]>;
	getAlbumWithArtists(albumId: number): Promise<AlbumWithArtists | null>;
	findAlbumByName(name: string): Promise<Album | null>;
	createSong(input: CreateSongInput): Promise<Song>;
	updateSong(input: UpdateSongInput): Promise<void>;
	deleteSong(songId: number): Promise<void>;
	getSongsReadable(request: PageRequest): Promise<SongReadable[]>;
	getSongsCount(): Promise<number>;
	createProducerWithAliases(input: CreateProducerInput): Promise<Producer>;
	updateProducerWithAliases(input: UpdateProducerInput): Promise<Producer>;
	deleteProducer(producerId: number): Promise<void>;
	getProducersWithAliases(): Promise<ProducerWithAliases[]>;
	matchProducersFromFilename(filename: string, songArtistIds: number[]): Promise<number[]>;
	getSettings(): Promise<Settings>;
	updateSettings(input: UpdateSettingsInput): Promise<Settings>;
	saveUploadedFile(input: FileUploadRequest): Promise<string>;
	saveArtwork(input: FileUploadRequest): Promise<string>;
	deleteFile(relPath: string): Promise<void>;
	cleanupFiles(relPaths: string[]): Promise<number>;
	showInFileExplorer(relPath: string): Promise<void>;
	uploadAlbumArt(input: AlbumArtUploadRequest): Promise<void>;
	extractMetadata(relPath: string): Promise<ExtractedMetadata>;
	writeSongMetadata(songId: number): Promise<SongProcessingResult>;
	writeAlbumMetadata(albumId: number): Promise<BatchResult>;
	writeProducerMetadata(producerId: number): Promise<BatchResult>;
	uploadAndExtractMetadata(input: SongBatchUploadRequest): Promise<UploadAndExtractResult>;
	createSongsWithMetadata(input: CreateSongsWithMetadataInput): Promise<Song[]>;
	uploadSongs(input: SongBatchUploadRequest): Promise<Song[]>;
	syncSongsToAppleMusic(): Promise<SyncResult>;
};

type TransportFactoryMap = {
	[K in keyof WailsTransport]: (
		app: RawWailsAppBindings,
		...args: Parameters<WailsTransport[K]>
	) => ReturnType<WailsTransport[K]>;
};

const missingRuntimeError = () =>
	new Error('Wails runtime not available. Start the desktop app to use backend bindings.');

const rejectMissingRuntime = <T>() => Promise.reject<T>(missingRuntimeError());

const transportFactories = {
	getInitialData: (app) => app.GetInitialData(),
	createArtist: (app, input) => app.CreateArtist(input),
	getArtists: (app) => app.GetArtists(),
	findArtistByName: (app, name) => app.FindArtistByName(name),
	createAlbum: (app, input) => app.CreateAlbum(input),
	updateAlbum: (app, input) => app.UpdateAlbum(input),
	deleteAlbum: (app, albumId) => app.DeleteAlbum(albumId),
	getAlbumsWithSongs: (app, { limit, offset }) => app.GetAlbumsWithSongs(limit, offset),
	getAlbumWithArtists: (app, albumId) => app.GetAlbumWithArtists(albumId),
	findAlbumByName: (app, name) => app.FindAlbumByName(name),
	createSong: (app, input) => app.CreateSong(input),
	updateSong: (app, input) => app.UpdateSong(input),
	deleteSong: (app, songId) => app.DeleteSong(songId),
	getSongsReadable: (app, { limit, offset }) => app.GetSongsReadable(limit, offset),
	getSongsCount: (app) => app.GetSongsCount(),
	createProducerWithAliases: (app, input) => app.CreateProducerWithAliases(input),
	updateProducerWithAliases: (app, input) => app.UpdateProducerWithAliases(input),
	deleteProducer: (app, producerId) => app.DeleteProducer(producerId),
	getProducersWithAliases: (app) => app.GetProducersWithAliases(),
	matchProducersFromFilename: (app, filename, songArtistIds) =>
		app.MatchProducersFromFilename(filename, songArtistIds),
	getSettings: (app) => app.GetSettings(),
	updateSettings: (app, input) => app.UpdateSettings(input),
	saveUploadedFile: (app, { filename, base64Data }) => app.SaveUploadedFile(filename, base64Data),
	saveArtwork: (app, { filename, base64Data }) => app.SaveArtwork(filename, base64Data),
	deleteFile: (app, relPath) => app.DeleteFile(relPath),
	cleanupFiles: (app, relPaths) => app.CleanupFiles(relPaths),
	showInFileExplorer: (app, relPath) => app.ShowInFileExplorer(relPath),
	uploadAlbumArt: (app, { albumId, filename, base64Data }) =>
		app.UploadAlbumArt(albumId, filename, base64Data),
	extractMetadata: (app, relPath) => app.ExtractMetadata(relPath),
	writeSongMetadata: (app, songId) => app.WriteSongMetadata(songId),
	writeAlbumMetadata: (app, albumId) => app.WriteAlbumMetadata(albumId),
	writeProducerMetadata: (app, producerId) => app.WriteProducerMetadata(producerId),
	uploadAndExtractMetadata: (app, { files, albumId }) =>
		app.UploadAndExtractMetadata(files, albumId ?? null),
	createSongsWithMetadata: (app, input) => app.CreateSongsWithMetadata(input),
	uploadSongs: (app, { files, albumId }) => app.UploadSongs(files, albumId ?? null),
	syncSongsToAppleMusic: (app) => app.SyncSongsToAppleMusic()
} satisfies TransportFactoryMap;

const missingRuntimeBindings: RawWailsAppBindings = {
	GetInitialData: () => rejectMissingRuntime(),
	CreateArtist: () => rejectMissingRuntime(),
	GetArtists: () => rejectMissingRuntime(),
	FindArtistByName: () => rejectMissingRuntime(),
	CreateAlbum: () => rejectMissingRuntime(),
	UpdateAlbum: () => rejectMissingRuntime(),
	DeleteAlbum: () => rejectMissingRuntime(),
	GetAlbumsWithSongs: () => rejectMissingRuntime(),
	GetAlbumWithArtists: () => rejectMissingRuntime(),
	FindAlbumByName: () => rejectMissingRuntime(),
	CreateSong: () => rejectMissingRuntime(),
	UpdateSong: () => rejectMissingRuntime(),
	DeleteSong: () => rejectMissingRuntime(),
	GetSongsReadable: () => rejectMissingRuntime(),
	GetSongsCount: () => rejectMissingRuntime(),
	CreateProducerWithAliases: () => rejectMissingRuntime(),
	UpdateProducerWithAliases: () => rejectMissingRuntime(),
	DeleteProducer: () => rejectMissingRuntime(),
	GetProducersWithAliases: () => rejectMissingRuntime(),
	MatchProducersFromFilename: () => rejectMissingRuntime(),
	GetSettings: () => rejectMissingRuntime(),
	UpdateSettings: () => rejectMissingRuntime(),
	SaveUploadedFile: () => rejectMissingRuntime(),
	SaveArtwork: () => rejectMissingRuntime(),
	DeleteFile: () => rejectMissingRuntime(),
	CleanupFiles: () => rejectMissingRuntime(),
	ShowInFileExplorer: () => rejectMissingRuntime(),
	UploadAlbumArt: () => rejectMissingRuntime(),
	ExtractMetadata: () => rejectMissingRuntime(),
	WriteSongMetadata: () => rejectMissingRuntime(),
	WriteAlbumMetadata: () => rejectMissingRuntime(),
	WriteProducerMetadata: () => rejectMissingRuntime(),
	UploadAndExtractMetadata: () => rejectMissingRuntime(),
	CreateSongsWithMetadata: () => rejectMissingRuntime(),
	UploadSongs: () => rejectMissingRuntime(),
	SyncSongsToAppleMusic: () => rejectMissingRuntime()
};

export function getRawWailsAppBindings(): RawWailsAppBindings {
	if (typeof window !== 'undefined' && window.go?.backend?.App) {
		return window.go.backend.App;
	}

	return missingRuntimeBindings;
}

function buildTransport(getApp: () => RawWailsAppBindings): WailsTransport {
	const transport = {} as WailsTransport;

	for (const key of Object.keys(transportFactories) as (keyof WailsTransport)[]) {
		const factory = transportFactories[key];
		transport[key] = ((...args: any[]) => (factory as any)(getApp(), ...args)) as any;
	}

	return transport;
}

export const wailsTransport = buildTransport(getRawWailsAppBindings);
