import { describe, expect, it } from 'vitest';
import { toAssetUrl } from './utils';

describe('utils', () => {
	it('normalizes asset paths for the frontend', () => {
		expect(toAssetUrl()).toBeUndefined();
		expect(toAssetUrl('')).toBe('');
		expect(toAssetUrl('uploads/song.mp3')).toBe('app://uploads/song.mp3');
		expect(toAssetUrl('/uploads/song.mp3')).toBe('app://uploads/song.mp3');
	});
});
