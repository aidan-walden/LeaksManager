import * as bindings from './bindings';
import { syncState } from '$lib/stores/sync.svelte';
import { notifyRuntimeError } from '$lib/errors/runtime-error';

export * from './types';

type AsyncBinding = (...args: any[]) => Promise<any>;

type WrapOptions<T extends AsyncBinding> = {
	markChanged?: boolean;
	onSuccess?: (result: Awaited<ReturnType<T>>) => void;
};

const wrapBinding = <T extends AsyncBinding>(name: string, fn: T, options: WrapOptions<T> = {}) => {
	return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
		try {
			const result = await fn(...args);
			if (options.markChanged) {
				syncState.markChanged();
			}
			options.onSuccess?.(result);
			return result;
		} catch (error) {
			notifyRuntimeError(error, name);
			throw error;
		}
	};
};

// --- Read-only / Non-mutating exports ---
export const GetInitialData = wrapBinding('GetInitialData', bindings.GetInitialData);
export const GetArtists = wrapBinding('GetArtists', bindings.GetArtists);
export const FindArtistByName = wrapBinding('FindArtistByName', bindings.FindArtistByName);
export const GetAlbumsWithSongs = wrapBinding('GetAlbumsWithSongs', bindings.GetAlbumsWithSongs);
export const GetAlbumWithArtists = wrapBinding(
	'GetAlbumWithArtists',
	bindings.GetAlbumWithArtists
);
export const FindAlbumByName = wrapBinding('FindAlbumByName', bindings.FindAlbumByName);
export const GetSongsReadable = wrapBinding('GetSongsReadable', bindings.GetSongsReadable);
export const GetSongsCount = wrapBinding('GetSongsCount', bindings.GetSongsCount);
export const GetProducersWithAliases = wrapBinding(
	'GetProducersWithAliases',
	bindings.GetProducersWithAliases
);
export const MatchProducersFromFilename = wrapBinding(
	'MatchProducersFromFilename',
	bindings.MatchProducersFromFilename
);
export const GetSettings = wrapBinding('GetSettings', bindings.GetSettings);
export const ShowInFileExplorer = wrapBinding('ShowInFileExplorer', bindings.ShowInFileExplorer);
export const ExtractMetadata = wrapBinding('ExtractMetadata', bindings.ExtractMetadata);
export const SyncSongsToAppleMusic = wrapBinding(
	'SyncSongsToAppleMusic',
	bindings.SyncSongsToAppleMusic
);

// --- Mutating exports ---
export const CreateArtist = wrapBinding('CreateArtist', bindings.CreateArtist);
export const CreateAlbum = wrapBinding('CreateAlbum', bindings.CreateAlbum);
export const UpdateAlbum = wrapBinding('UpdateAlbum', bindings.UpdateAlbum);
export const DeleteAlbum = wrapBinding('DeleteAlbum', bindings.DeleteAlbum);
export const CreateSong = wrapBinding('CreateSong', bindings.CreateSong, { markChanged: true });
export const UpdateSong = wrapBinding('UpdateSong', bindings.UpdateSong, { markChanged: true });
export const DeleteSong = wrapBinding('DeleteSong', bindings.DeleteSong, { markChanged: true });
export const CreateProducerWithAliases = wrapBinding(
	'CreateProducerWithAliases',
	bindings.CreateProducerWithAliases
);
export const UpdateProducerWithAliases = wrapBinding(
	'UpdateProducerWithAliases',
	bindings.UpdateProducerWithAliases
);
export const DeleteProducer = wrapBinding('DeleteProducer', bindings.DeleteProducer);
export const SaveUploadedFile = wrapBinding('SaveUploadedFile', bindings.SaveUploadedFile);
export const SaveArtwork = wrapBinding('SaveArtwork', bindings.SaveArtwork);
export const DeleteFile = wrapBinding('DeleteFile', bindings.DeleteFile);
export const CleanupFiles = wrapBinding('CleanupFiles', bindings.CleanupFiles);
export const UploadAlbumArt = wrapBinding('UploadAlbumArt', bindings.UploadAlbumArt);
export const WriteSongMetadata = wrapBinding('WriteSongMetadata', bindings.WriteSongMetadata, {
	markChanged: true
});
export const WriteAlbumMetadata = wrapBinding('WriteAlbumMetadata', bindings.WriteAlbumMetadata);
export const WriteProducerMetadata = wrapBinding(
	'WriteProducerMetadata',
	bindings.WriteProducerMetadata
);
export const UploadAndExtractMetadata = wrapBinding(
	'UploadAndExtractMetadata',
	bindings.UploadAndExtractMetadata
);
export const CreateSongsWithMetadata = wrapBinding(
	'CreateSongsWithMetadata',
	bindings.CreateSongsWithMetadata,
	{ markChanged: true }
);
export const UploadSongs = wrapBinding('UploadSongs', bindings.UploadSongs, { markChanged: true });

export const UpdateSettings = wrapBinding('UpdateSettings', bindings.UpdateSettings, {
	onSuccess: (result) => {
		syncState.configure(result.importToAppleMusic);
	}
});
