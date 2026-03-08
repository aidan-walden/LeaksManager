import { describe, expect, it } from 'vitest';
import { getProducersContext, setProducersContext } from './producers-context';

describe('producers context module', () => {
	it('exports producer context helpers', () => {
		expect(typeof setProducersContext).toBe('function');
		expect(typeof getProducersContext).toBe('function');
	});
});
