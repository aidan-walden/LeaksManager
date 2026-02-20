import * as bindings from './bindings';
import { syncState } from '$lib/stores/sync.svelte';
import { notifyRuntimeError } from '$lib/errors/runtime-error';

export * from './types';

const wrapRead = <T extends (...args: any[]) => Promise<any>>(name: string, fn: T) => {
	return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
		try {
			return await fn(...args);
		} catch (error) {
			notifyRuntimeError(error, name);
			throw error;
		}
	};
};

// Helper to wrap mutating functions
const wrapMutating = <T extends (...args: any[]) => Promise<any>>(name: string, fn: T) => {
	return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
		try {
			const result = await fn(...args);
			syncState.markChanged();
			return result;
		} catch (error) {
			notifyRuntimeError(error, name);
			throw error;
		}
	};
};

// --- Read-only / Non-mutating exports ---
export const GetInitialData = wrapRead('GetInitialData', bindings.GetInitialData);
export const GetArtists = wrapRead('GetArtists', bindings.GetArtists);
export const FindArtistByName = wrapRead('FindArtistByName', bindings.FindArtistByName);
export const GetAlbumsWithSongs = wrapRead('GetAlbumsWithSongs', bindings.GetAlbumsWithSongs);
export const GetAlbumWithArtists = wrapRead('GetAlbumWithArtists', bindings.GetAlbumWithArtists);
export const FindAlbumByName = wrapRead('FindAlbumByName', bindings.FindAlbumByName);
export const GetSongsReadable = wrapRead('GetSongsReadable', bindings.GetSongsReadable);
export const GetSongsCount = wrapRead('GetSongsCount', bindings.GetSongsCount);
export const GetProducersWithAliases = wrapRead(
	'GetProducersWithAliases',
	bindings.GetProducersWithAliases
);
export const MatchProducersFromFilename = wrapRead(
	'MatchProducersFromFilename',
	bindings.MatchProducersFromFilename
);
export const GetSettings = wrapRead('GetSettings', bindings.GetSettings);
export const ShowInFileExplorer = wrapRead('ShowInFileExplorer', bindings.ShowInFileExplorer);
export const ExtractMetadata = wrapRead('ExtractMetadata', bindings.ExtractMetadata);
export const SyncSongsToAppleMusic = wrapRead(
	'SyncSongsToAppleMusic',
	bindings.SyncSongsToAppleMusic
);

// --- Mutating exports ---
export const CreateArtist = wrapMutating('CreateArtist', bindings.CreateArtist);
export const CreateAlbum = wrapMutating('CreateAlbum', bindings.CreateAlbum);
export const UpdateAlbum = wrapMutating('UpdateAlbum', bindings.UpdateAlbum);
export const DeleteAlbum = wrapMutating('DeleteAlbum', bindings.DeleteAlbum);
export const CreateSong = wrapMutating('CreateSong', bindings.CreateSong);
export const UpdateSong = wrapMutating('UpdateSong', bindings.UpdateSong);
export const DeleteSong = wrapMutating('DeleteSong', bindings.DeleteSong);
export const CreateProducerWithAliases = wrapMutating(
	'CreateProducerWithAliases',
	bindings.CreateProducerWithAliases
);
export const UpdateProducerWithAliases = wrapMutating(
	'UpdateProducerWithAliases',
	bindings.UpdateProducerWithAliases
);
export const DeleteProducer = wrapMutating('DeleteProducer', bindings.DeleteProducer);
export const UpdateSettings = wrapMutating('UpdateSettings', bindings.UpdateSettings);
export const SaveUploadedFile = wrapMutating('SaveUploadedFile', bindings.SaveUploadedFile);
export const SaveArtwork = wrapMutating('SaveArtwork', bindings.SaveArtwork);
export const DeleteFile = wrapMutating('DeleteFile', bindings.DeleteFile);
export const CleanupFiles = wrapMutating('CleanupFiles', bindings.CleanupFiles);
export const UploadAlbumArt = wrapMutating('UploadAlbumArt', bindings.UploadAlbumArt);
export const WriteSongMetadata = wrapMutating('WriteSongMetadata', bindings.WriteSongMetadata);
export const WriteAlbumMetadata = wrapMutating('WriteAlbumMetadata', bindings.WriteAlbumMetadata);
export const WriteProducerMetadata = wrapMutating(
	'WriteProducerMetadata',
	bindings.WriteProducerMetadata
);
export const UploadAndExtractMetadata = wrapMutating(
	'UploadAndExtractMetadata',
	bindings.UploadAndExtractMetadata
);
export const CreateSongsWithMetadata = wrapMutating(
	'CreateSongsWithMetadata',
	bindings.CreateSongsWithMetadata
);
export const UploadSongs = wrapMutating('UploadSongs', bindings.UploadSongs);
