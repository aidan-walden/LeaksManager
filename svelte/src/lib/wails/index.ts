import * as bindings from './bindings';
import { syncState } from '$lib/stores/sync.svelte';

export * from './types';

// Helper to wrap mutating functions
const wrap = <T extends (...args: any[]) => Promise<any>>(fn: T) => {
	return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
		const result = await fn(...args);
		syncState.markChanged();
		return result;
	};
};

// --- Read-only / Non-mutating exports ---
export const {
	GetInitialData,
	GetArtists,
	FindArtistByName,
	GetAlbumsWithSongs,
	GetAlbumWithArtists,
	FindAlbumByName,
	GetSongsReadable,
	GetSongsCount,
	GetProducersWithAliases,
	MatchProducersFromFilename,
	GetSettings,
	ShowInFileExplorer,
	ExtractMetadata
} = bindings;

// --- Mutating exports ---
export const CreateArtist = wrap(bindings.CreateArtist);
export const CreateAlbum = wrap(bindings.CreateAlbum);
export const UpdateAlbum = wrap(bindings.UpdateAlbum);
export const DeleteAlbum = wrap(bindings.DeleteAlbum);
export const CreateSong = wrap(bindings.CreateSong);
export const UpdateSong = wrap(bindings.UpdateSong);
export const DeleteSong = wrap(bindings.DeleteSong);
export const CreateProducerWithAliases = wrap(bindings.CreateProducerWithAliases);
export const UpdateProducerWithAliases = wrap(bindings.UpdateProducerWithAliases);
export const DeleteProducer = wrap(bindings.DeleteProducer);
export const UpdateSettings = wrap(bindings.UpdateSettings);
export const SaveUploadedFile = wrap(bindings.SaveUploadedFile);
export const SaveArtwork = wrap(bindings.SaveArtwork);
export const DeleteFile = wrap(bindings.DeleteFile);
export const CleanupFiles = wrap(bindings.CleanupFiles);
export const UploadAlbumArt = wrap(bindings.UploadAlbumArt);
export const WriteSongMetadata = wrap(bindings.WriteSongMetadata);
export const WriteAlbumMetadata = wrap(bindings.WriteAlbumMetadata);
export const WriteProducerMetadata = wrap(bindings.WriteProducerMetadata);
export const UploadAndExtractMetadata = wrap(bindings.UploadAndExtractMetadata);
export const CreateSongsWithMetadata = wrap(bindings.CreateSongsWithMetadata);
export const UploadSongs = wrap(bindings.UploadSongs);