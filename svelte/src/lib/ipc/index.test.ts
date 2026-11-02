import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRawIpcBindings, type RawIpcBindings } from './bindings';
import { RuntimeErrorNotifier } from '$lib/errors/runtime-error';
import { createIpcActions } from '$lib/services/ipc-actions';

describe('ipc actions', () => {
	let api: RawIpcBindings;
	let runtimeErrors: RuntimeErrorNotifier;
	let notifySpy: ReturnType<typeof vi.spyOn>;
	let ipcActions: ReturnType<typeof createIpcActions>;

	beforeEach(() => {
		api = {
			UpdateSong: vi.fn(),
			GetSongsReadable: vi.fn()
		} as unknown as RawIpcBindings;
		window.api = api;
		runtimeErrors = new RuntimeErrorNotifier();
		notifySpy = vi.spyOn(runtimeErrors, 'notify');
		ipcActions = createIpcActions(runtimeErrors);
	});

	it('uses the Electron preload bindings directly', () => {
		expect(getRawIpcBindings()).toBe(api);
	});

	it('forwards all arguments and returns the result', async () => {
		vi.mocked(api.GetSongsReadable).mockResolvedValue([]);

		await expect(ipcActions.getSongsReadable(25, 50)).resolves.toEqual([]);

		expect(api.GetSongsReadable).toHaveBeenCalledWith(25, 50);
	});

	it('reports runtime failures before rethrowing', async () => {
		const error = new Error('boom');
		vi.mocked(api.UpdateSong).mockRejectedValue(error);

		await expect(
			ipcActions.updateSong({ id: 1, name: 'Track', artistIds: [], producerIds: [] })
		).rejects.toThrow('boom');

		expect(notifySpy).toHaveBeenCalledWith(error, 'UpdateSong');
	});
});
