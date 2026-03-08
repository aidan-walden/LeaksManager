import { describe, expect, it } from 'vitest';
import * as HoverCard from './index';

describe('hover card barrel', () => {
	it('exports hover card primitives', () => {
		expect(Object.keys(HoverCard).length).toBeGreaterThan(0);
	});
});
