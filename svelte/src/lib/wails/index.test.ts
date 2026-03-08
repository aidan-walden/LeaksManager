import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRawWailsAppBindings, wailsTransport } from './bindings';
import { createRuntimeErrorNotifier } from '$lib/errors/runtime-error';
import { createWailsActions } from '$lib/services/wails-actions';
import { createSyncState } from '$lib/stores/sync.svelte';

vi.mock('./bindings', async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import('./bindings');
	return {
		...actual,
		wailsTransport: {
			...actual.wailsTransport,
			createSong: vi.fn(),
			updateSettings: vi.fn()
		}
	};
});

describe('wails wrapper bindings', () => {
	const runtimeErrors = {
		notify: vi.fn(),
		reset: vi.fn()
	};
	const syncState = createSyncState();
	const wailsActions = createWailsActions({ syncState, runtimeErrors }, wailsTransport);

	beforeEach(() => {
		vi.clearAllMocks();
		syncState.configure(false, false);
	});

	it('marks sync state as changed after successful mutating calls', async () => {
		vi.mocked(wailsTransport.createSong).mockResolvedValue({
			id: 1,
			name: 'Track',
			filepath: 'uploads/songs/track.mp3',
			albumId: null,
			artworkPath: null,
			genre: null,
			year: null,
			trackNumber: null,
			duration: null,
			fileType: null,
			createdAt: 0,
			updatedAt: 0,
			synced: false
		});
		syncState.configure(true, false);

		await wailsActions.createSong({
			name: 'Track',
			filepath: 'uploads/songs/track.mp3',
			artistIds: [],
			producerIds: []
		});

		expect(syncState.hasChanges).toBe(true);
	});

	it('reports runtime failures before rethrowing', async () => {
		const error = new Error('boom');
		vi.mocked(wailsTransport.createSong).mockRejectedValue(error);

		await expect(
			wailsActions.createSong({
				name: 'Track',
				filepath: 'uploads/songs/track.mp3',
				artistIds: [],
				producerIds: []
			})
		).rejects.toThrow('boom');

		expect(runtimeErrors.notify).toHaveBeenCalledWith(error, 'CreateSong');
	});

	it('reconfigures sync state from updated settings', async () => {
		vi.mocked(wailsTransport.updateSettings).mockResolvedValue({
			id: 1,
			clearTrackNumberOnUpload: false,
			importToAppleMusic: true,
			automaticallyMakeSingles: false,
			updatedAt: 1
		});

		await wailsActions.updateSettings({ importToAppleMusic: true });

		expect(syncState.isAppleMusicEnabled).toBe(true);
		expect(syncState.hasChanges).toBe(false);
	});

	it('rejects missing-runtime bindings instead of returning fake placeholder shapes', async () => {
		const originalWindow = globalThis.window;
		Reflect.deleteProperty(globalThis, 'window');

		try {
			await expect(getRawWailsAppBindings().GetInitialData()).rejects.toThrow(
				'Wails runtime not available'
			);
		} finally {
			globalThis.window = originalWindow;
		}
	});
});
