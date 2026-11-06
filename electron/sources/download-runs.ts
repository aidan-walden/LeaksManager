import { API_EVENTS } from '../channels';
import { downloadSourceSongs } from '../domain/workflows';
import type { DownloadSourceSongsResult, SourceDownloadProgress } from '../domain/models';
import type { IpcDeps } from '../ipc';
import type { SongSource } from './song-source';

const activeRuns = new Map<string, AbortController>();

// Connects one batch download to IPC: progress events and cancellation by downloadId.
export async function runSourceDownload(
	deps: IpcDeps,
	downloadId: string,
	source: SongSource,
	songIds: string[],
	albumId: number | null
): Promise<DownloadSourceSongsResult> {
	if (activeRuns.has(downloadId)) throw new Error(`download already running: ${downloadId}`);

	const controller = new AbortController();
	activeRuns.set(downloadId, controller);
	try {
		return await downloadSourceSongs(deps.db, deps.staticPath, source, songIds, albumId, {
			signal: controller.signal,
			onProgress(progress) {
				// The window can close during a batch, and macOS keeps the app running after that.
				if (deps.window.isDestroyed()) return;
				const event: SourceDownloadProgress = { downloadId, ...progress };
				deps.window.webContents.send(API_EVENTS.SourceDownloadProgress, event);
			}
		});
	} finally {
		activeRuns.delete(downloadId);
	}
}

// Returns false when the batch already ended.
export function cancelSourceDownload(downloadId: string): boolean {
	const controller = activeRuns.get(downloadId);
	controller?.abort();
	return controller !== undefined;
}
