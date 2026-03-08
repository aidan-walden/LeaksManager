import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WailsActions } from '$lib/services/wails-actions';

vi.mock('./ui/data-table/render-helpers.js', () => ({
	renderComponent: vi.fn((_component, props) => props)
}));

vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn().mockResolvedValue(undefined)
}));

import { invalidateAll } from '$app/navigation';
import { createSongColumns } from './columns';

describe('song table columns', () => {
	const wailsActions = {
		deleteSong: vi.fn().mockResolvedValue(undefined)
	} satisfies Pick<WailsActions, 'deleteSong'>;
	const onSongDeleted = vi.fn().mockResolvedValue(undefined);
	const columns = createSongColumns(wailsActions, { onSongDeleted });

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('builds the expected visible columns', () => {
		expect(
			columns.map(
				(column) => column.id ?? ('accessorKey' in column ? column.accessorKey : undefined)
			)
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

		expect(wailsActions.deleteSong).toHaveBeenCalledWith(7);
		expect(invalidateAll).toHaveBeenCalled();
		expect(onSongDeleted).toHaveBeenCalledWith(7);
	});
});
