import { describe, expect, it } from 'vitest';
import * as Command from './index';

describe('command barrel', () => {
	it('exports command primitives', () => {
		expect(Object.keys(Command).length).toBeGreaterThan(0);
	});
});
