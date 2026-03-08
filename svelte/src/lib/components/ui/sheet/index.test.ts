import { describe, expect, it } from 'vitest';
import * as Sheet from './index';

describe('sheet barrel', () => {
	it('exports sheet primitives', () => {
		expect(Object.keys(Sheet).length).toBeGreaterThan(0);
	});
});
