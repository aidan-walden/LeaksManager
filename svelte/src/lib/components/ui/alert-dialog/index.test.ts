import { describe, expect, it } from 'vitest';
import * as AlertDialog from './index';

describe('alert dialog barrel', () => {
	it('exports dialog primitives', () => {
		expect(Object.keys(AlertDialog).length).toBeGreaterThan(0);
	});
});
