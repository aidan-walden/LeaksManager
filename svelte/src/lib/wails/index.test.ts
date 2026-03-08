import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bindings from './bindings';
import { notifyRuntimeError } from '$lib/errors/runtime-error';
import { syncState } from '$lib/stores/sync.svelte';
import { CreateSong, UpdateSettings } from './index';

vi.mock('$lib/errors/runtime-error', () => ({
	notifyRuntimeError: vi.fn()
}));

vi.mock('./bindings', async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import('./bindings');
	return {
		...actual,
		CreateSong: vi.fn(),
		UpdateSettings: vi.fn()
	};
});

describe('wails wrapper bindings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		syncState.configure(false, false);
	});

	it('marks sync state as changed after successful mutating calls', async () => {
		vi.mocked(bindings.CreateSong).mockResolvedValue({
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

		await CreateSong({
			name: 'Track',
			filepath: 'uploads/songs/track.mp3',
			artistIds: [],
			producerIds: []
		});

		expect(syncState.hasChanges).toBe(true);
	});

	it('reports runtime failures before rethrowing', async () => {
		const error = new Error('boom');
		vi.mocked(bindings.CreateSong).mockRejectedValue(error);

		await expect(
			CreateSong({
				name: 'Track',
				filepath: 'uploads/songs/track.mp3',
				artistIds: [],
				producerIds: []
			})
		).rejects.toThrow('boom');

		expect(notifyRuntimeError).toHaveBeenCalledWith(error, 'CreateSong');
	});

	it('reconfigures sync state from updated settings', async () => {
		vi.mocked(bindings.UpdateSettings).mockResolvedValue({
			id: 1,
			clearTrackNumberOnUpload: false,
			importToAppleMusic: true,
			automaticallyMakeSingles: false,
			updatedAt: 1
		});

		await UpdateSettings({ importToAppleMusic: true });

		expect(syncState.isAppleMusicEnabled).toBe(true);
		expect(syncState.hasChanges).toBe(false);
	});
});
