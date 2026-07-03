import { describe, it, expect } from 'vitest';
import { parseArtists } from './artists';

// Parity mirror of backend/utils.go ParseArtists + svelte artist-parser.test.ts
// (SC-006). Same delimiter set, order-preserving dedupe, empty handling.
describe('parseArtists', () => {
	it('splits common collaboration delimiters and preserves order', () => {
		expect(parseArtists('Kanye West feat. Jay-Z & Rihanna')).toEqual([
			'Kanye West',
			'Jay-Z',
			'Rihanna'
		]);
	});

	it('splits on comma, ampersand, and semicolon', () => {
		expect(parseArtists('A, B & C; D')).toEqual(['A', 'B', 'C', 'D']);
	});

	it('handles ft. / ft / featuring variants', () => {
		expect(parseArtists('A ft. B')).toEqual(['A', 'B']);
		expect(parseArtists('A ft B')).toEqual(['A', 'B']);
		expect(parseArtists('A featuring B')).toEqual(['A', 'B']);
		expect(parseArtists('A feat B')).toEqual(['A', 'B']);
	});

	it('deduplicates case-sensitively while preserving order', () => {
		expect(parseArtists('Drake, Drake & Future')).toEqual(['Drake', 'Future']);
		// case-sensitive: different casing is NOT deduped
		expect(parseArtists('Drake, drake')).toEqual(['Drake', 'drake']);
	});

	it('returns an empty array for empty / whitespace / null input', () => {
		expect(parseArtists('')).toEqual([]);
		expect(parseArtists('   ')).toEqual([]);
		expect(parseArtists(null)).toEqual([]);
		expect(parseArtists(undefined)).toEqual([]);
	});
});
