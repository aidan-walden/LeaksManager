import { describe, expect, it } from 'vitest';
import { cmdOrCtrl, isMac, optionOrAlt } from './is-mac.svelte';

describe('is-mac helpers', () => {
	it('exports platform shortcut labels', () => {
		expect(typeof isMac).toBe('boolean');
		expect([cmdOrCtrl, optionOrAlt].every((value) => typeof value === 'string')).toBe(true);
	});
});
