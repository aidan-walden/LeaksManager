import { describe, expect, it } from 'vitest';
import * as Tooltip from './index';

describe('tooltip barrel', () => {
	it('exports tooltip primitives', () => {
		expect(Object.keys(Tooltip).length).toBeGreaterThan(0);
	});
});
