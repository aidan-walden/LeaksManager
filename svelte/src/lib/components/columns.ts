import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from './ui/data-table';
import DataTableActions from '$lib/components/ui/data-table/data-table-actions.svelte';
import { invalidateAll } from '$app/navigation';
import SongHover from './table/song-hover.svelte';
import { DeleteSong, type SongReadable } from '$lib/wails';

// EditableSong mirrors the shape returned by GetSongsReadable from Go
export type EditableSong = SongReadable;

async function onDelete(id: number) {
	await DeleteSong(id);
	await invalidateAll();
}

export const columns: ColumnDef<EditableSong>[] = [
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
			// You can pass whatever you need from `row.original` to the component
			return renderComponent(DataTableActions, { song: row.original, onDelete: onDelete });
		}
	}
];
