import { describe, expect, it } from 'vitest';
import * as Popover from './index';

describe('popover barrel', () => {
	it('exports popover primitives', () => {
		expect(Object.keys(Popover).length).toBeGreaterThan(0);
	});
});
