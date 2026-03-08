import { describe, expect, it } from 'vitest';
import { ACCEPT_AUDIO, BYTE, displaySize, GIGABYTE, KILOBYTE, MEGABYTE } from './index';

describe('file drop zone helpers', () => {
	it('formats file sizes across units', () => {
		expect(displaySize(BYTE)).toBe('1 B');
		expect(displaySize(KILOBYTE)).toBe('1 KB');
		expect(displaySize(MEGABYTE)).toBe('1 MB');
		expect(displaySize(GIGABYTE)).toBe('1 GB');
	});

	it('exports shared accept constants', () => {
		expect(ACCEPT_AUDIO).toBe('audio/*');
	});
});
