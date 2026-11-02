import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from './ui/data-table/render-helpers.js';
import SongRowActions from '$lib/components/features/song-row-actions.svelte';
import { invalidateAll } from '$app/navigation';
import SongHover from './table/song-hover.svelte';
import type { SongReadable } from '$lib/ipc';
import type { IpcActions } from '$lib/services/ipc-actions';

export function createSongColumns(
	ipcActions: Pick<IpcActions, 'deleteSong'>
): ColumnDef<SongReadable>[] {
	async function onDelete(id: number) {
		await ipcActions.deleteSong(id);
		void invalidateAll();
	}

	return [
		{
			accessorKey: 'name',
			header: 'Title',
			cell: ({ row }) => {
				return renderComponent(SongHover, { song: row.original });
			}
		},
		{
			accessorKey: 'artist',
			header: 'Artist'
		},
		{
			accessorKey: 'album.name',
			header: 'Album'
		},
		{
			id: 'actions',
			cell: ({ row }) => {
				return renderComponent(SongRowActions, {
					song: row.original,
					onDelete
				});
			}
		}
	];
}
