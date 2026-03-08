	<script lang="ts">
		import DataTable from '$lib/components/ui/data-table/data-table.svelte';
		import FileDropZone from '$lib/components/ui/file-drop-zone/file-drop-zone.svelte';
		import SongsTableSkeleton from '$lib/components/features/songs-table-skeleton.svelte';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import { createSongColumns } from '../columns';
	import type { SongReadable } from '$lib/wails';

	let {
		songs: initialSongs,
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
	let songs = $state<SongReadable[]>(initialSongs);
	let isLoading = $state(false);
	const { wailsActions } = getAppServicesContext();
	const columns = createSongColumns(wailsActions);

	$effect(() => {
		songs = initialSongs;
		currentPage = 0;
		isLoading = false;
	});

	async function fetchSongsForPage(page: number) {
		isLoading = true;
		const offset = page * songsPerPage;
		songs = await wailsActions.getSongsReadable({ limit: songsPerPage, offset });
		isLoading = false;
		currentPage = page;
	}

	function handleNextPage() {
		const nextPage = currentPage + 1;
		if (nextPage < Math.ceil(songsCount / songsPerPage)) {
			fetchSongsForPage(nextPage);
		}
	}

	function handlePreviousPage() {
		const prevPage = currentPage - 1;
		if (prevPage >= 0) {
			fetchSongsForPage(prevPage);
		}
	}

	const canNextPage = $derived(currentPage < Math.ceil(songsCount / songsPerPage) - 1);
	const canPreviousPage = $derived(currentPage > 0);
</script>

{#snippet table()}
	{#if isLoading}
		<SongsTableSkeleton rowCount={songsPerPage} />
	{:else}
		<DataTable
			data={songs}
			{columns}
			pageSize={songsPerPage}
			pagination={{
				pageIndex: currentPage,
				pageSize: songsPerPage,
				totalCount: songsCount
			}}
			onPaginationChange={fetchSongsForPage}
		/>
	{/if}
{/snippet}

<FileDropZone {onUpload} children={table} class="contents" clickable={false} />
