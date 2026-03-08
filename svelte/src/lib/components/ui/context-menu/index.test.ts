import { describe, expect, it } from 'vitest';
import * as ContextMenu from './index';

describe('context menu barrel', () => {
	it('exports context menu primitives', () => {
		expect(Object.keys(ContextMenu).length).toBeGreaterThan(0);
	});
});
