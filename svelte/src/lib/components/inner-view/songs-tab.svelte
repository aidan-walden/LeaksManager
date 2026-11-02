<script lang="ts">
	import { untrack } from 'svelte';
	import DataTable from '$lib/components/ui/data-table/data-table.svelte';
	import FileDropZone from '$lib/components/ui/file-drop-zone/file-drop-zone.svelte';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import { createSongColumns } from '../columns';
	import { clampSongsPage } from './songs-table';
	import type { SongReadable } from '$lib/ipc';

	let {
		songs: firstPageSongs,
		songsPerPage,
		songsCount,
		onUpload
	}: {
		songs: SongReadable[];
		songsPerPage: number;
		songsCount: number;
		onUpload: (files: File[]) => Promise<void>;
	} = $props();

	let currentPage = $state(0);
	// Rows for pages after the first. The first page comes from props.
	let laterPageSongs = $state<SongReadable[]>([]);
	let latestRequestId = 0;
	const { ipcActions } = getAppServicesContext();
	const columns = createSongColumns(ipcActions);
	const visibleSongs = $derived(currentPage === 0 ? firstPageSongs : laterPageSongs);

	async function showPage(page: number) {
		const requestId = ++latestRequestId;
		const nextPage = clampSongsPage(page, songsCount, songsPerPage);
		const rows =
			nextPage === 0 ? [] : await ipcActions.getSongsReadable(songsPerPage, nextPage * songsPerPage);

		if (requestId !== latestRequestId) {
			return;
		}

		laterPageSongs = rows;
		currentPage = nextPage;
	}

	// Every song change ends in invalidateAll, which delivers new props. Reload the
	// current page then; showPage also moves back if that page no longer exists.
	$effect(() => {
		void firstPageSongs;
		void songsCount;
		untrack(() => void showPage(currentPage));
	});
</script>

{#snippet table()}
	<DataTable
		data={visibleSongs}
		{columns}
		pageSize={songsPerPage}
		pagination={{
			pageIndex: currentPage,
			pageSize: songsPerPage,
			totalCount: songsCount
		}}
		onPaginationChange={showPage}
	/>
{/snippet}

<FileDropZone {onUpload} children={table} class="contents" clickable={false} />
