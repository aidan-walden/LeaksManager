import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from './ui/data-table/render-helpers.js';
import SongRowActions from '$lib/components/features/song-row-actions.svelte';
import { invalidateAll } from '$app/navigation';
import SongHover from './table/song-hover.svelte';
import type { SongReadable } from '$lib/ipc';
import type { IpcActions } from '$lib/services/ipc-actions';

type SongMutationHandlers = {
	onSongDeleted?: (songId: number) => void | Promise<void>;
	onSongSaved?: (song: SongReadable) => void | Promise<void>;
};

export function createSongColumns(
	ipcActions: Pick<IpcActions, 'deleteSong'>,
	handlers: SongMutationHandlers = {}
): ColumnDef<SongReadable>[] {
	async function onDelete(id: number) {
		await ipcActions.deleteSong(id);
		await handlers.onSongDeleted?.(id);
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
					onDelete,
					onSongSaved: handlers.onSongSaved
				});
			}
		}
	];
}
