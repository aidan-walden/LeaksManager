	<script lang="ts">
		import DataTable from '$lib/components/ui/data-table/data-table.svelte';
		import FileDropZone from '$lib/components/ui/file-drop-zone/file-drop-zone.svelte';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import { createSongColumns } from '../columns';
	import {
		clampSongsPage,
		mergeIncomingPageRows,
		removeSongFromPage,
		replaceSongInPage
	} from './songs-table';
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
		onUpload: (files: File[]) => Promise<number>;
	} = $props();

	let currentPage = $state(0);
	let localSongs = $state<SongReadable[] | null>(null);
	let localSongsCount = $state<number | null>(null);
	let refreshRequestId = 0;
	const { wailsActions } = getAppServicesContext();
	const columns = createSongColumns(wailsActions, {
		onSongDeleted: handleSongDeleted,
		onSongSaved: handleSongSaved
	});
	const visibleSongs = $derived(localSongs ?? initialSongs);
	const totalSongsCount = $derived(localSongsCount ?? songsCount);

	async function refreshSongs(page = currentPage) {
		const requestId = refreshRequestId + 1;
		refreshRequestId = requestId;
		const nextSongsCount = await wailsActions.getSongsCount();
		const nextPage = clampSongsPage(page, nextSongsCount, songsPerPage);
		const offset = nextPage * songsPerPage;
		const nextSongs = await wailsActions.getSongsReadable({ limit: songsPerPage, offset });

		if (requestId !== refreshRequestId) {
			return;
		}

		localSongsCount = nextSongsCount;
		localSongs = nextSongs;
		currentPage = nextPage;
	}

	async function handleSongDeleted(songId: number) {
		const nextSongsCount = Math.max(totalSongsCount - 1, 0);
		const nextPage = clampSongsPage(currentPage, nextSongsCount, songsPerPage);

		localSongsCount = nextSongsCount;

		if (nextPage !== currentPage) {
			await refreshSongs(nextPage);
			return;
		}

		const nextVisibleSongs = removeSongFromPage(visibleSongs, songId);
		const replacementOffset = currentPage * songsPerPage + nextVisibleSongs.length;
		const hasReplacementRow = nextSongsCount > replacementOffset;
		if (!hasReplacementRow) {
			localSongs = nextVisibleSongs;
			return;
		}

		const replacementRows = await wailsActions.getSongsReadable({ limit: 1, offset: replacementOffset });
		localSongs = [...nextVisibleSongs, ...replacementRows];
	}

	async function handleSongSaved(updatedSong: SongReadable) {
		localSongs = replaceSongInPage(visibleSongs, updatedSong);
	}

	async function handleUploadAndRefresh(files: File[]) {
		const createdCount = await onUpload(files);
		if (createdCount === 0) {
			return;
		}

		localSongsCount = totalSongsCount + createdCount;

		const pageOffset = currentPage * songsPerPage;
		const incomingRows = await wailsActions.getSongsReadable({
			limit: Math.min(createdCount, songsPerPage),
			offset: pageOffset
		});
		localSongs = mergeIncomingPageRows(incomingRows, visibleSongs, songsPerPage);
	}
</script>

{#snippet table()}
	<DataTable
		data={visibleSongs}
		{columns}
		pageSize={songsPerPage}
		pagination={{
			pageIndex: currentPage,
			pageSize: songsPerPage,
			totalCount: totalSongsCount
		}}
		onPaginationChange={refreshSongs}
	/>
{/snippet}

<FileDropZone onUpload={handleUploadAndRefresh} children={table} class="contents" clickable={false} />
