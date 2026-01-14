<script lang="ts">
	import DataTable from '$lib/components/ui/data-table/data-table.svelte';
	import FileDropZone from '$lib/components/ui/file-drop-zone/file-drop-zone.svelte';
	import SongsTableSkeleton from '$lib/components/ui/data-table/songs-table-skeleton.svelte';
	import { columns } from '../columns';
	import type { PageData } from '../../../routes/[tab]/$types';
	import { GetSongsReadable } from '$lib/wails';

	type SongsPromise = PageData['songs'];
	type Songs = Awaited<SongsPromise>;

	let { songsPromise, songsPerPage, songsCount, onUpload }: {
		songsPromise: SongsPromise;
		songsPerPage: number;
		songsCount: number;
		onUpload: (files: File[]) => Promise<void>;
	} = $props();

	let currentPage = $state(0);
	let songs = $state<Songs>([]);
	let isLoading = $state(true);

	// load initial songs
	$effect(() => {
		songsPromise.then((initialSongs) => {
			songs = initialSongs;
			isLoading = false;
		});
	});

	async function fetchSongsForPage(page: number) {
		isLoading = true;
		const offset = page * songsPerPage;
		songs = await GetSongsReadable(songsPerPage, offset);
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
			manualPagination={true}
			pageCount={Math.ceil(songsCount / songsPerPage)}
			{canNextPage}
			{canPreviousPage}
			onNextPage={handleNextPage}
			onPreviousPage={handlePreviousPage}
		/>
	{/if}
{/snippet}

<FileDropZone onUpload={onUpload} children={table} class="contents" clickable={false} />
