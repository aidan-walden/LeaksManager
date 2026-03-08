import { describe, expect, it } from 'vitest';
import {
	clampSongsPage,
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
