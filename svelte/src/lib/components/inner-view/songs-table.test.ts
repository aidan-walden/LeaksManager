import { describe, expect, it } from 'vitest';
import { clampSongsPage } from './songs-table';

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
