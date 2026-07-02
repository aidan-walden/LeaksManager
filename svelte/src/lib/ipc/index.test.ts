import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRawIpcBindings, type RawIpcBindings } from './bindings';
import { RuntimeErrorNotifier } from '$lib/errors/runtime-error';
import { createIpcActions } from '$lib/services/ipc-actions';
import { SyncState } from '$lib/stores/sync.svelte';

describe('ipc actions', () => {
	let api: RawIpcBindings;
	let runtimeErrors: RuntimeErrorNotifier;
	let notifySpy: ReturnType<typeof vi.spyOn>;
	let syncState: SyncState;
	let ipcActions: ReturnType<typeof createIpcActions>;

	beforeEach(() => {
		api = {
			CreateSong: vi.fn(),
			UpdateSettings: vi.fn(),
			GetAppleMusicLibrary: vi.fn()
		} as unknown as RawIpcBindings;
		window.api = api;
		runtimeErrors = new RuntimeErrorNotifier();
		notifySpy = vi.spyOn(runtimeErrors, 'notify');
		syncState = new SyncState();
		ipcActions = createIpcActions({ syncState, runtimeErrors });
	});

	it('uses the Electron preload bindings directly', () => {
		expect(getRawIpcBindings()).toBe(api);
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

		await ipcActions.createSong({
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
			ipcActions.createSong({
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

		await ipcActions.updateSettings({ importToAppleMusic: true });

		expect(syncState.isAppleMusicEnabled).toBe(true);
		expect(syncState.hasChanges).toBe(false);
	});

	it('exposes Apple Music library fetch through the actions wrapper', async () => {
		vi.mocked(api.GetAppleMusicLibrary).mockResolvedValue([
			{
				id: 'abc',
				databaseId: 0,
				name: 'Track',
				artist: 'Artist',
				albumArtist: '',
				album: 'Album',
				genre: '',
				year: 2026,
				duration: 123,
				trackNumber: 1,
				trackCount: 1,
				discNumber: 1,
				discCount: 1
			}
		]);

		await expect(ipcActions.getAppleMusicLibrary()).resolves.toHaveLength(1);
		expect(api.GetAppleMusicLibrary).toHaveBeenCalledOnce();
	});
});
