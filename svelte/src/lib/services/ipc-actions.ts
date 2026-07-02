import type { RuntimeErrorNotifier } from '$lib/errors/runtime-error';
import type { SyncState } from '$lib/stores/sync.svelte';
import { getRawIpcBindings } from '$lib/ipc';
import type {
	AlbumArtUploadRequest,
	CreateAlbumInput,
	CreateArtistInput,
	CreateProducerInput,
	CreateSongInput,
	CreateSongsWithMetadataInput,
	PageRequest,
	SongBatchUploadRequest,
	UpdateAlbumInput,
	UpdateProducerInput,
	UpdateSettingsInput,
	UpdateSongInput
} from '$lib/ipc';

export type IpcActionDependencies = {
	syncState: SyncState;
	runtimeErrors: RuntimeErrorNotifier;
};

type ActionOptions<T> = {
	markChanged?: boolean;
	onSuccess?: (result: T) => void;
};

async function runAction<T>(
	{ syncState, runtimeErrors }: IpcActionDependencies,
	context: string,
	call: () => Promise<T>,
	options: ActionOptions<T> = {}
) {
	try {
		const result = await call();
		if (options.markChanged) syncState.markChanged();
		options.onSuccess?.(result);
		return result;
	} catch (error) {
		runtimeErrors.notify(error, context);
		throw error;
	}
}

export function createIpcActions(dependencies: IpcActionDependencies) {
	const api = () => getRawIpcBindings();

	return {
		createArtist: (input: CreateArtistInput) =>
			runAction(dependencies, 'CreateArtist', () => api().CreateArtist(input)),
		createAlbum: (input: CreateAlbumInput) =>
			runAction(dependencies, 'CreateAlbum', () => api().CreateAlbum(input)),
		updateAlbum: (input: UpdateAlbumInput) =>
			runAction(dependencies, 'UpdateAlbum', () => api().UpdateAlbum(input)),
		deleteAlbum: (albumId: number) =>
			runAction(dependencies, 'DeleteAlbum', () => api().DeleteAlbum(albumId)),
		createSong: (input: CreateSongInput) =>
			runAction(dependencies, 'CreateSong', () => api().CreateSong(input), { markChanged: true }),
		updateSong: (input: UpdateSongInput) =>
			runAction(dependencies, 'UpdateSong', () => api().UpdateSong(input), { markChanged: true }),
		deleteSong: (songId: number) =>
			runAction(dependencies, 'DeleteSong', () => api().DeleteSong(songId), { markChanged: true }),
		getSongsReadable: ({ limit, offset }: PageRequest) =>
			runAction(dependencies, 'GetSongsReadable', () => api().GetSongsReadable(limit, offset)),
		getSongsCount: () => runAction(dependencies, 'GetSongsCount', () => api().GetSongsCount()),
		createProducerWithAliases: (input: CreateProducerInput) =>
			runAction(dependencies, 'CreateProducerWithAliases', () =>
				api().CreateProducerWithAliases(input)
			),
		updateProducerWithAliases: (input: UpdateProducerInput) =>
			runAction(dependencies, 'UpdateProducerWithAliases', () =>
				api().UpdateProducerWithAliases(input)
			),
		deleteProducer: (producerId: number) =>
			runAction(dependencies, 'DeleteProducer', () => api().DeleteProducer(producerId)),
		getProducersWithAliases: () =>
			runAction(dependencies, 'GetProducersWithAliases', () => api().GetProducersWithAliases()),
		matchProducersFromFilename: (filename: string, songArtistIds: number[]) =>
			runAction(dependencies, 'MatchProducersFromFilename', () =>
				api().MatchProducersFromFilename(filename, songArtistIds)
			),
		updateSettings: (input: UpdateSettingsInput) =>
			runAction(dependencies, 'UpdateSettings', () => api().UpdateSettings(input), {
				onSuccess: (settings) => dependencies.syncState.configure(settings.importToAppleMusic)
			}),
		cleanupFiles: (relPaths: string[]) =>
			runAction(dependencies, 'CleanupFiles', () => api().CleanupFiles(relPaths)),
		showInFileExplorer: (relPath: string) =>
			runAction(dependencies, 'ShowInFileExplorer', () => api().ShowInFileExplorer(relPath)),
		uploadAlbumArt: ({ albumId, filename, base64Data }: AlbumArtUploadRequest) =>
			runAction(dependencies, 'UploadAlbumArt', () =>
				api().UploadAlbumArt(albumId, filename, base64Data)
			),
		extractMetadata: (relPath: string) =>
			runAction(dependencies, 'ExtractMetadata', () => api().ExtractMetadata(relPath)),
		writeSongMetadata: (songId: number) =>
			runAction(dependencies, 'WriteSongMetadata', () => api().WriteSongMetadata(songId), {
				markChanged: true
			}),
		writeAlbumMetadata: (albumId: number) =>
			runAction(dependencies, 'WriteAlbumMetadata', () => api().WriteAlbumMetadata(albumId)),
		writeProducerMetadata: (producerId: number) =>
			runAction(dependencies, 'WriteProducerMetadata', () =>
				api().WriteProducerMetadata(producerId)
			),
		uploadAndExtractMetadata: ({ files, albumId }: SongBatchUploadRequest) =>
			runAction(dependencies, 'UploadAndExtractMetadata', () =>
				api().UploadAndExtractMetadata(files, albumId ?? null)
			),
		createSongsWithMetadata: (input: CreateSongsWithMetadataInput) =>
			runAction(dependencies, 'CreateSongsWithMetadata', () => api().CreateSongsWithMetadata(input), {
				markChanged: true
			}),
		uploadSongs: ({ files, albumId }: SongBatchUploadRequest) =>
			runAction(dependencies, 'UploadSongs', () => api().UploadSongs(files, albumId ?? null), {
				markChanged: true
			}),
		getAppleMusicLibrary: () =>
			runAction(dependencies, 'GetAppleMusicLibrary', () => api().GetAppleMusicLibrary()),
		syncSongsToAppleMusic: () =>
			runAction(dependencies, 'SyncSongsToAppleMusic', () => api().SyncSongsToAppleMusic())
	};
}

export type IpcActions = ReturnType<typeof createIpcActions>;
