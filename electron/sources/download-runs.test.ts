import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_EVENTS } from '../channels';
import type { IpcDeps } from '../ipc';
import { cancelSourceDownload, runSourceDownload } from './download-runs';
import type { SongSource } from './song-source';

// downloadSong stays pending until the run's signal aborts.
const blockingSource = (onStart: () => void): SongSource => ({
	id: 'fake',
	name: 'Fake',
	imageOrigins: [],
	getFilters: async () => [],
	browse: async () => ({ songs: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false }),
	downloadSong: (_id, signal) =>
		new Promise((_resolve, reject) => {
			signal?.addEventListener('abort', () => reject(signal.reason));
			onStart();
		})
});

function setup(isDestroyed = false) {
	const staticPath = mkdtempSync(join(tmpdir(), 'leaks-runs-'));
	mkdirSync(join(staticPath, 'uploads', 'songs'), { recursive: true });
	const send = vi.fn();
	const deps = {
		db: new Database(':memory:'),
		staticPath,
		window: { isDestroyed: () => isDestroyed, webContents: { send } }
	} as unknown as IpcDeps;
	return { deps, send, cleanup: () => rmSync(staticPath, { recursive: true, force: true }) };
}

describe('runSourceDownload', () => {
	it('sends progress with the download id and cancels by that id', async () => {
		const { deps, send, cleanup } = setup();
		const source = blockingSource(() => cancelSourceDownload('run-1'));

		const result = await runSourceDownload(deps, 'run-1', source, ['a', 'b'], null);

		expect(result.cancelled).toBe(true);
		expect(send).toHaveBeenCalledWith(
			API_EVENTS.SourceDownloadProgress,
			expect.objectContaining({ downloadId: 'run-1', songId: 'a', totalSongs: 2 })
		);
		expect(cancelSourceDownload('run-1')).toBe(false);
		cleanup();
	});

	it('rejects a second batch with an id that is in use', async () => {
		const { deps, cleanup } = setup();
		let first!: ReturnType<typeof runSourceDownload>;
		await new Promise<void>((started) => {
			first = runSourceDownload(deps, 'dup', blockingSource(started), ['a'], null);
		});

		await expect(
			runSourceDownload(deps, 'dup', blockingSource(() => {}), ['a'], null)
		).rejects.toThrow('already running');

		expect(cancelSourceDownload('dup')).toBe(true);
		await first;
		cleanup();
	});

	it('does not send to a closed window', async () => {
		const { deps, send, cleanup } = setup(true);
		const source = blockingSource(() => cancelSourceDownload('closed'));

		await runSourceDownload(deps, 'closed', source, ['a'], null);

		expect(send).not.toHaveBeenCalled();
		cleanup();
	});
});
