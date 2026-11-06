import type { RuntimeErrorNotifier } from '$lib/errors/runtime-error';
import { getRawIpcBindings, type RawIpcBindings } from '$lib/ipc';

export function createIpcActions(runtimeErrors: RuntimeErrorNotifier) {
	// Wraps a raw IPC method so a failure shows a toast before it rejects.
	function action<K extends keyof RawIpcBindings>(name: K) {
		type Method = RawIpcBindings[K];
		return async (...args: Parameters<Method>): Promise<Awaited<ReturnType<Method>>> => {
			try {
				const method = getRawIpcBindings()[name] as unknown as (
					...args: Parameters<Method>
				) => ReturnType<Method>;
				// $state proxies can't cross IPC: structured clone rejects them.
				const plainArgs = args.map((arg) => $state.snapshot(arg)) as Parameters<Method>;
				return await method(...plainArgs);
			} catch (error) {
				runtimeErrors.notify(error, name);
				throw error;
			}
		};
	}

	return {
		createArtist: action('CreateArtist'),
		createAlbum: action('CreateAlbum'),
		updateAlbum: action('UpdateAlbum'),
		deleteAlbum: action('DeleteAlbum'),
		updateSong: action('UpdateSong'),
		deleteSong: action('DeleteSong'),
		getSongsReadable: action('GetSongsReadable'),
		getSongsCount: action('GetSongsCount'),
		createProducerWithAliases: action('CreateProducerWithAliases'),
		updateProducerWithAliases: action('UpdateProducerWithAliases'),
		deleteProducer: action('DeleteProducer'),
		updateSettings: action('UpdateSettings'),
		cleanupFiles: action('CleanupFiles'),
		showInFileExplorer: action('ShowInFileExplorer'),
		uploadAlbumArt: action('UploadAlbumArt'),
		writeSongMetadata: action('WriteSongMetadata'),
		writeAlbumMetadata: action('WriteAlbumMetadata'),
		writeProducerMetadata: action('WriteProducerMetadata'),
		uploadAndExtractMetadata: action('UploadAndExtractMetadata'),
		createSongsWithMetadata: action('CreateSongsWithMetadata'),
		getSongSources: action('GetSongSources'),
		getSourceFilters: action('GetSourceFilters'),
		browseSource: action('BrowseSource'),
		downloadSourceSongs: action('DownloadSourceSongs'),
		cancelSourceDownload: action('CancelSourceDownload'),
		onSourceDownloadProgress: (
			listener: Parameters<RawIpcBindings['OnSourceDownloadProgress']>[0]
		) => getRawIpcBindings().OnSourceDownloadProgress(listener),
		syncSongsToAppleMusic: action('SyncSongsToAppleMusic')
	};
}

export type IpcActions = ReturnType<typeof createIpcActions>;
