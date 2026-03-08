import { describe, expect, it } from 'vitest';
import { getAlbumsContext, setAlbumsContext } from './albums-context';

describe('albums context module', () => {
	it('exports album context helpers', () => {
		expect(typeof setAlbumsContext).toBe('function');
		expect(typeof getAlbumsContext).toBe('function');
	});
});
