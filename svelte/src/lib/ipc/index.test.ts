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
			UpdateSong: vi.fn(),
			UpdateSettings: vi.fn()
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
		vi.mocked(api.UpdateSong).mockResolvedValue(null);
		syncState.configure(true, false);

		await ipcActions.updateSong({ id: 1, name: 'Track', artistIds: [], producerIds: [] });

		expect(syncState.hasChanges).toBe(true);
	});

	it('reports runtime failures before rethrowing', async () => {
		const error = new Error('boom');
		vi.mocked(api.UpdateSong).mockRejectedValue(error);

		await expect(
			ipcActions.updateSong({ id: 1, name: 'Track', artistIds: [], producerIds: [] })
		).rejects.toThrow('boom');

		expect(notifySpy).toHaveBeenCalledWith(error, 'UpdateSong');
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
});
