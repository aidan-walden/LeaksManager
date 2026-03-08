import { describe, expect, it } from 'vitest';
import { coerceArtistMapping, createArtistSelectionState } from './artist-mapping';

describe('artist mapping helpers', () => {
	it('initializes select state with create-new markers', () => {
		expect(createArtistSelectionState(['Artist', 'Guest'])).toEqual({
			Artist: 'CREATE_NEW',
			Guest: 'CREATE_NEW'
		});
	});

	it('coerces numeric select values back to typed ids', () => {
		expect(
			coerceArtistMapping({
				Artist: '12',
				Guest: 'CREATE_NEW'
			})
		).toEqual({
			Artist: 12,
			Guest: 'CREATE_NEW'
		});
	});

	it('rejects invalid select values instead of leaking strings', () => {
		expect(() =>
			coerceArtistMapping({
				Artist: 'abc'
			})
		).toThrow('invalid artist mapping');
	});
});
