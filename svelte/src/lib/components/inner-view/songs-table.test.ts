import { describe, expect, it } from 'vitest';
import {
	clampSongsPage,
	getSongsPagePropSyncMode,
	mergeIncomingPageRows,
	removeSongFromPage,
	replaceSongInPage
} from './songs-table';

describe('clampSongsPage', () => {
	it('keeps the requested page when it is still valid', () => {
		expect(clampSongsPage(1, 75, 25)).toBe(1);
	});

	it('clamps to the last remaining page after deletions', () => {
		expect(clampSongsPage(2, 50, 25)).toBe(1);
	});

	it('returns the first page when there are no songs left', () => {
		expect(clampSongsPage(3, 0, 25)).toBe(0);
	});
});

describe('page row helpers', () => {
	it('replaces the visible page from props when the first page is refreshed', () => {
		expect(
			getSongsPagePropSyncMode(
				0,
				{ songs: [{ id: 1 }], songsCount: 10 },
				{ songs: [{ id: 2 }], songsCount: 11 }
			)
		).toBe('replace-visible');
	});

	it('refreshes the current page when later pages receive new props', () => {
		expect(
			getSongsPagePropSyncMode(
				2,
				{ songs: [{ id: 1 }], songsCount: 75 },
				{ songs: [{ id: 2 }], songsCount: 76 }
			)
		).toBe('refresh-current-page');
	});

	it('ignores the first prop snapshot and unchanged props', () => {
		expect(getSongsPagePropSyncMode(0, null, { songs: [], songsCount: 0 })).toBe('none');
		const songs = [{ id: 1 }];
		expect(getSongsPagePropSyncMode(0, { songs, songsCount: 1 }, { songs, songsCount: 1 })).toBe(
			'none'
		);
	});

	it('removes deleted songs from the visible page', () => {
		expect(
			removeSongFromPage(
				[
					{ id: 1, name: 'A' },
					{ id: 2, name: 'B' }
				],
				1
			)
		).toEqual([{ id: 2, name: 'B' }]);
	});

	it('replaces the updated song in place', () => {
		expect(
			replaceSongInPage(
				[
					{ id: 1, name: 'Old' },
					{ id: 2, name: 'Keep' }
				],
				{ id: 1, name: 'New' }
			)
		).toEqual([
			{ id: 1, name: 'New' },
			{ id: 2, name: 'Keep' }
		]);
	});

	it('merges newly affected rows without rebuilding the full page', () => {
		expect(
			mergeIncomingPageRows(
				[{ id: 10 }, { id: 9 }],
				[{ id: 8 }, { id: 7 }, { id: 6 }],
				4
			)
		).toEqual([{ id: 10 }, { id: 9 }, { id: 8 }, { id: 7 }]);
	});
});
