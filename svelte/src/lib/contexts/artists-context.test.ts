import { describe, expect, it } from 'vitest';
import { getArtistsContext, setArtistsContext } from './artists-context';

describe('artists context module', () => {
	it('exports artist context helpers', () => {
		expect(typeof setArtistsContext).toBe('function');
		expect(typeof getArtistsContext).toBe('function');
	});
});
