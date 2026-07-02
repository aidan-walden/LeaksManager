import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRawWailsAppBindings, type RawWailsAppBindings } from './bindings';
import { RuntimeErrorNotifier } from '$lib/errors/runtime-error';
import { createWailsActions } from '$lib/services/wails-actions';
import { SyncState } from '$lib/stores/sync.svelte';

describe('wails actions', () => {
	let api: RawWailsAppBindings;
	let runtimeErrors: RuntimeErrorNotifier;
	let notifySpy: ReturnType<typeof vi.spyOn>;
	let syncState: SyncState;
	let wailsActions: ReturnType<typeof createWailsActions>;

	beforeEach(() => {
		api = {
			CreateSong: vi.fn(),
			UpdateSettings: vi.fn()
		} as unknown as RawWailsAppBindings;
		window.api = api;
		runtimeErrors = new RuntimeErrorNotifier();
		notifySpy = vi.spyOn(runtimeErrors, 'notify');
		syncState = new SyncState();
		wailsActions = createWailsActions({ syncState, runtimeErrors });
	});

	it('uses the Electron preload bindings directly', () => {
		expect(getRawWailsAppBindings()).toBe(api);
	});

	it('marks sync state as changed after successful mutating calls', async () => {
		vi.mocked(api.CreateSong).mockResolvedValue({
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
		vi.mocked(api.CreateSong).mockRejectedValue(error);

		await expect(
			wailsActions.createSong({
				name: 'Track',
				filepath: 'uploads/songs/track.mp3',
				artistIds: [],
				producerIds: []
			})
		).rejects.toThrow('boom');

		expect(notifySpy).toHaveBeenCalledWith(error, 'CreateSong');
	});

	it('reconfigures sync state from updated settings', async () => {
		vi.mocked(api.UpdateSettings).mockResolvedValue({
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
});
