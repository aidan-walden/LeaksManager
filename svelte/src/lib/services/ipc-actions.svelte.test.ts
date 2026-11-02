import { expect, it, vi } from 'vitest';
import { RuntimeErrorNotifier } from '$lib/errors/runtime-error';
import type { RawIpcBindings } from '$lib/ipc';
import { createIpcActions } from './ipc-actions.svelte';

it('sends $state data as plain values that structured clone accepts', async () => {
	const updateSong = vi.fn().mockResolvedValue(null);
	window.api = { UpdateSong: updateSong } as unknown as RawIpcBindings;
	const artistIds = $state([1, 2]);

	await createIpcActions(new RuntimeErrorNotifier()).updateSong({
		id: 1,
		artistIds,
		producerIds: []
	});

	expect(() => structuredClone(updateSong.mock.calls[0])).not.toThrow();
	expect(updateSong.mock.calls[0][0].artistIds).toEqual([1, 2]);
});
