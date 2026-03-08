import { describe, expect, it } from 'vitest';
import * as DropdownMenu from './index';

describe('dropdown menu barrel', () => {
	it('exports dropdown primitives', () => {
		expect(Object.keys(DropdownMenu).length).toBeGreaterThan(0);
	});
});
