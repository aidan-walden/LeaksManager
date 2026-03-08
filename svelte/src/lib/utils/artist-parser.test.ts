import { describe, expect, it } from 'vitest';
import { parseArtists } from './artist-parser';

describe('parseArtists', () => {
	it('splits common collaboration delimiters and preserves order', () => {
		expect(parseArtists('Kanye West feat. Jay-Z & Rihanna')).toEqual([
			'Kanye West',
			'Jay-Z',
			'Rihanna'
		]);
	});

	it('returns an empty array for empty input', () => {
		expect(parseArtists(null)).toEqual([]);
		expect(parseArtists('   ')).toEqual([]);
	});
});
