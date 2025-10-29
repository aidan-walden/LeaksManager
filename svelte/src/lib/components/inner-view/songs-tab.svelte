<script lang="ts">
	import DataTable from '$lib/components/ui/data-table/data-table.svelte';
	import FileDropZone from '$lib/components/ui/file-drop-zone/file-drop-zone.svelte';
	import SongsTableSkeleton from '$lib/components/ui/data-table/songs-table-skeleton.svelte';
	import { columns } from '../columns';
	import type { PageData } from '../../../routes/[tab]/$types';

	type SongsPromise = PageData['songs'];

let { songsPromise, songsPerPage, onUpload }: {
	songsPromise: SongsPromise;
	songsPerPage: number;
	onUpload: (files: File[]) => Promise<void>;
} = $props();
</script>

{#snippet table()}
	{#await songsPromise}
		<SongsTableSkeleton rowCount={songsPerPage} />
	{:then songs}
		<DataTable data={songs} {columns} />
	{/await}
{/snippet}

<FileDropZone onUpload={onUpload} children={table} class="contents" clickable={false} />
