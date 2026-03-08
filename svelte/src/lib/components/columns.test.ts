import { describe, expect, it, vi } from 'vitest';

vi.mock('./ui/data-table', () => ({
	renderComponent: vi.fn((_component, props) => props)
}));

vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/wails', () => ({
	DeleteSong: vi.fn().mockResolvedValue(undefined)
}));

import { invalidateAll } from '$app/navigation';
import { DeleteSong } from '$lib/wails';
import { columns } from './columns';

describe('song table columns', () => {
	it('builds the expected visible columns', () => {
		expect(
			columns.map((column) => column.id ?? ('accessorKey' in column ? column.accessorKey : undefined))
		).toEqual(['name', 'artist', 'album.name', 'actions']);
	});

	it('deletes songs through the actions column callback', async () => {
		const actionColumn = columns.find((column) => column.id === 'actions');
		if (!actionColumn || typeof actionColumn.cell !== 'function') {
			throw new Error('expected actions column with cell renderer');
		}

		const props = actionColumn.cell({
			row: {
				original: {
					id: 7
				}
			}
		} as never) as { onDelete: (id: number) => Promise<void> };

		await props.onDelete(7);

		expect(DeleteSong).toHaveBeenCalledWith(7);
		expect(invalidateAll).toHaveBeenCalled();
	});
});
