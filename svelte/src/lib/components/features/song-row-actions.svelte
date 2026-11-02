<script lang="ts">
	import EntityActionsMenu from '$lib/components/shared/entity-actions-menu.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import CreateSongCard from '$lib/components/features/create-song-card.svelte';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import type { SongReadable } from '$lib/ipc';

	let {
		song,
		onDelete,
		onSongSaved
	}: {
		song: SongReadable;
		onDelete: (id: number) => void | Promise<void>;
		onSongSaved?: (song: SongReadable) => void | Promise<void>;
	} = $props();
	let editingSong = $state(false);
	const { ipcActions } = getAppServicesContext();

	function onClickEdit() {
		editingSong = true;
	}

	async function onClickShowInFileExplorer() {
		await ipcActions.showInFileExplorer(song.filepath);
	}
</script>

<EntityActionsMenu onEdit={onClickEdit} onDelete={() => onDelete(song.id)}>
	<DropdownMenu.Item onclick={onClickShowInFileExplorer}>Show in File Explorer</DropdownMenu.Item>
</EntityActionsMenu>

<CreateSongCard bind:open={editingSong} {song} {onSongSaved} />
