import { describe, expect, it, vi } from 'vitest';
import { SidebarState, setSidebar, useSidebar } from './context.svelte';

describe('sidebar context module', () => {
	it('toggles desktop state through the provided setter', () => {
		let open = false;
		const setOpen = vi.fn((value: boolean) => {
			open = value;
		});
		const sidebar = new SidebarState(
			{
				open: () => open,
				setOpen
			},
			{ current: false }
		);

		sidebar.toggle();

		expect(setOpen).toHaveBeenCalledWith(true);
	});

	it('toggles mobile state locally when on a small viewport', () => {
		const sidebar = new SidebarState(
			{
				open: () => false,
				setOpen: vi.fn()
			},
			{ current: true }
		);

		sidebar.toggle();

		expect(sidebar.openMobile).toBe(true);
	});

	it('exports sidebar context helpers', () => {
		expect(typeof SidebarState).toBe('function');
		expect(typeof setSidebar).toBe('function');
		expect(typeof useSidebar).toBe('function');
	});
});
