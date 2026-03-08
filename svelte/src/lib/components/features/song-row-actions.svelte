<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import CreateSongCard from '$lib/components/features/create-song-card.svelte';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import type { EditableSong } from '$lib/components/columns';
	import type { SongReadable } from '$lib/wails';

	let {
		song,
		onDelete,
		onSongSaved
	}: {
		song: EditableSong;
		onDelete: (id: number) => void | Promise<void>;
		onSongSaved?: (song: SongReadable) => void | Promise<void>;
	} = $props();
	let editingSong = $state(false);
	const { wailsActions } = getAppServicesContext();

	function onClickEdit() {
		editingSong = true;
	}

	async function onClickShowInFileExplorer() {
		await wailsActions.showInFileExplorer(song.filepath);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" class="relative size-8 p-0">
				<span class="sr-only">Open menu</span>
				<EllipsisIcon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content>
		<DropdownMenu.Group>
			<DropdownMenu.Label>Actions</DropdownMenu.Label>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onclick={onClickEdit}>Edit</DropdownMenu.Item>
			<DropdownMenu.Item onclick={onClickShowInFileExplorer}
				>Show in File Explorer</DropdownMenu.Item
			>
			<DropdownMenu.Item style="color: red;" onclick={() => onDelete(song.id)}
				>Delete</DropdownMenu.Item
			>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<CreateSongCard bind:open={editingSong} {song} {onSongSaved} />
