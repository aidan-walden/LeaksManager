import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from './ui/data-table';
import DataTableActions from '$lib/components/ui/data-table/data-table-actions.svelte';
import type { SongWithRelations } from '@/server/db/schema';
import { invalidate, invalidateAll } from '$app/navigation';

// This type mirrors the shape returned by getSongsReadable
export type EditableSong = Omit<SongWithRelations, 'songProducers'> & {
	songProducers?: SongWithRelations['songProducers'];
	artist: string;
};

async function onDelete(id: number) {
	const formData = new FormData();
	formData.append('id', id.toString());
	await fetch('?/deleteSong', {
		method: 'POST',
		body: formData
	});

	await invalidateAll();
}

export const columns: ColumnDef<EditableSong>[] = [
	{
		accessorKey: 'name',
		header: 'Title'
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
