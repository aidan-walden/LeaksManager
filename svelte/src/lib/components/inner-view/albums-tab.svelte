<script lang="ts">
	import FileDropZone from '$lib/components/ui/file-drop-zone/file-drop-zone.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import CreateAlbumCard from '$lib/components/features/create-album-card.svelte';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio/index.js';
	import EntityActionsMenu from '$lib/components/shared/entity-actions-menu.svelte';
	import { invalidateAll } from '$app/navigation';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import type { AlbumWithSongs } from '$lib/ipc';
	import { toAssetUrl } from '$lib/utils';

	let creatingAlbum = $state(false);
	let currentAlbum = $state<AlbumWithSongs | null>(null);
	const { ipcActions } = getAppServicesContext();

	async function onDelete(id: number) {
		await ipcActions.deleteAlbum(id);
		await invalidateAll();
	}

	function openCreateModal() {
		currentAlbum = null;
		creatingAlbum = true;
	}

	function onClickEdit(album: AlbumWithSongs) {
		currentAlbum = album;
		creatingAlbum = true;
	}

	let {
		albums,
		defaultThumbnail,
		onUpload
	}: {
		albums: AlbumWithSongs[];
		defaultThumbnail: string;
		onUpload: (files: File[], albumId: number) => Promise<void>;
	} = $props();
</script>

<div class="items-left flex flex-row gap-4">
	<Button onclick={openCreateModal}>+</Button>
</div>

{#if creatingAlbum}
	<CreateAlbumCard bind:open={creatingAlbum} album={currentAlbum} />
{/if}

<div class="mt-4 flex flex-row flex-wrap gap-4">
	{#each albums as album (album.id)}
		<div class="mb-4 flex w-[256px] flex-col gap-2 rounded border p-4">
			<FileDropZone
				onUpload={(files) => onUpload(files, album.id)}
				class="contents"
				clickable={false}
				accept="audio/*"
			>
				<AspectRatio ratio={1 / 1} class="bg-muted">
					<img
						src={toAssetUrl(album.artworkPath) || defaultThumbnail}
						alt={album.name}
						class="rounded-md object-cover"
					/>
				</AspectRatio>
				<div class="flex flex-row justify-between">
					<div class="mt-2 flex flex-col gap-2">
						<p class="block text-sm font-medium">{album.name}</p>
						{#if album.artists && album.artists.length > 0}
							<p class="block text-xs text-muted-foreground">
								{album.artists.map((artist) => artist.name).join(', ')}
							</p>
						{/if}
					</div>
					<EntityActionsMenu
						onEdit={() => onClickEdit(album)}
						onDelete={() => onDelete(album.id)}
					/>
				</div>
			</FileDropZone>
		</div>
	{/each}
</div>
