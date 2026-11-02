import type {
	Album,
	Artist,
	BatchResult,
	CreateAlbumInput,
	CreateArtistInput,
	CreateProducerInput,
	CreateSongsWithMetadataInput,
	FileUpload,
	InitialData,
	Producer,
	Settings,
	Song,
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
		api: RawIpcBindings;
	}
}

export type RawIpcBindings = {
	GetInitialData(): Promise<InitialData>;
	CreateArtist(input: CreateArtistInput): Promise<Artist>;
	CreateAlbum(input: CreateAlbumInput): Promise<Album>;
	UpdateAlbum(input: UpdateAlbumInput): Promise<void>;
	DeleteAlbum(albumId: number): Promise<void>;
	UpdateSong(input: UpdateSongInput): Promise<SongReadable | null>;
	DeleteSong(songId: number): Promise<void>;
	GetSongsReadable(limit: number, offset: number): Promise<SongReadable[]>;
	GetSongsCount(): Promise<number>;
	CreateProducerWithAliases(input: CreateProducerInput): Promise<Producer>;
	UpdateProducerWithAliases(input: UpdateProducerInput): Promise<Producer>;
	DeleteProducer(producerId: number): Promise<void>;
	UpdateSettings(input: UpdateSettingsInput): Promise<Settings>;
	CleanupFiles(relPaths: string[]): Promise<number>;
	ShowInFileExplorer(relPath: string): Promise<void>;
	UploadAlbumArt(albumId: number, filename: string, base64Data: string): Promise<void>;
	WriteSongMetadata(songId: number): Promise<SongProcessingResult>;
	WriteAlbumMetadata(albumId: number): Promise<BatchResult>;
	WriteProducerMetadata(producerId: number): Promise<BatchResult>;
	UploadAndExtractMetadata(
		files: FileUpload[],
		albumId: number | null
	): Promise<UploadAndExtractResult>;
	CreateSongsWithMetadata(input: CreateSongsWithMetadataInput): Promise<Song[]>;
	SyncSongsToAppleMusic(): Promise<SyncResult>;
};

export function getRawIpcBindings(): RawIpcBindings {
	return window.api;
}
