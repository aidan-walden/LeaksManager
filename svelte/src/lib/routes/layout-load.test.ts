import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load, prerender, ssr, trailingSlash } from '../../routes/+layout';

vi.mock('$lib/wails', () => ({
	getRawWailsAppBindings: vi.fn()
}));

import { getRawWailsAppBindings } from '$lib/wails';

describe('+layout load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loads initial Wails data without mutating app stores', async () => {
		vi.mocked(getRawWailsAppBindings).mockReturnValue({
			GetInitialData: vi.fn().mockResolvedValue({
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
			})
		} as never);

		const result = await load();

		expect(ssr).toBe(false);
		expect(prerender).toBe(false);
		expect(trailingSlash).toBe('always');
		expect(result.songs).toEqual([]);
		expect(result.hasUnsyncedChanges).toBe(true);
		expect(result.limits.songsPerPage).toBe(25);
	});
});
