import { describe, expect, it } from 'vitest';
import * as Dialog from './index';

describe('dialog barrel', () => {
	it('exports dialog primitives', () => {
		expect(Object.keys(Dialog).length).toBeGreaterThan(0);
	});
});
