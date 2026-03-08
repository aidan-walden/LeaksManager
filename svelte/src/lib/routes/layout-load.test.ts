import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load, prerender, ssr, trailingSlash } from '../../routes/+layout';
import { syncState } from '$lib/stores/sync.svelte';

vi.mock('$lib/wails', () => ({
	GetInitialData: vi.fn()
}));

import { GetInitialData } from '$lib/wails';

describe('+layout load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		syncState.configure(false, false);
	});

	it('loads initial Wails data and configures sync state', async () => {
		vi.mocked(GetInitialData).mockResolvedValue({
			songs: [],
			songsCount: 0,
			albums: [],
			artists: [],
			producers: [],
			settings: {
				id: 1,
				clearTrackNumberOnUpload: false,
				importToAppleMusic: true,
				automaticallyMakeSingles: false,
				updatedAt: 1
			},
			isMac: true,
			limits: {
				songsPerPage: 25,
				albumsPerPage: 25
			},
			hasUnsyncedChanges: true
		});

		const result = await load();

		expect(ssr).toBe(false);
		expect(prerender).toBe(false);
		expect(trailingSlash).toBe('always');
		expect(syncState.shouldShow).toBe(true);
		await expect(result.songs).resolves.toEqual([]);
		expect(result.limits.songsPerPage).toBe(25);
	});
});
