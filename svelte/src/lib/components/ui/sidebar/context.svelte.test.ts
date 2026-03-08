import { describe, expect, it } from 'vitest';
import { setSidebar, useSidebar } from './context.svelte';

describe('sidebar context module', () => {
	it('exports sidebar context helpers', () => {
		expect(typeof setSidebar).toBe('function');
		expect(typeof useSidebar).toBe('function');
	});
});
