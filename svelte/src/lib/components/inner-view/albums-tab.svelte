<script lang="ts">
	import FileDropZone from '$lib/components/ui/file-drop-zone/file-drop-zone.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import CreateAlbumCard from '$lib/components/ui/create-album-card.svelte';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio/index.js';
	import AlbumsSkeleton from '$lib/components/ui/albums-skeleton.svelte';
	import type { PageData } from '../../../routes/[tab]/$types';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { invalidateAll } from '$app/navigation';
	import { editableAlbumSchema, type EditableAlbum } from '@/schema';
	import { DeleteAlbum } from '$lib/wails';
	import type { AlbumWithSongs } from '$lib/wails';

	type AlbumsPromise = PageData['albums'];

	let creatingAlbum = $state(false);
	let currentAlbum = $state<EditableAlbum | null>(null);

	async function onDelete(id: number) {
		await DeleteAlbum(id);
		await invalidateAll();
	}

	function openCreateModal() {
		currentAlbum = null;
		creatingAlbum = true;
	}

	function convertToEditableAlbum(album: AlbumWithSongs): EditableAlbum {
		const albumArtists = album.artists.map((artist, index) => ({
			artistId: artist.id,
			order: index,
			artist: {
				id: artist.id,
				name: artist.name
			}
		}));

		return editableAlbumSchema.parse({
			id: album.id,
			name: album.name,
			artworkPath: album.artworkPath,
			genre: album.genre,
			year: album.year,
			albumArtists
		});
	}

	function onClickEdit(album: AlbumWithSongs) {
		currentAlbum = convertToEditableAlbum(album);
		creatingAlbum = true;
	}

	let {
		albumsPromise,
		albumsPerPage,
		defaultThumbnail,
		onUpload
	}: {
		albumsPromise: AlbumsPromise;
		albumsPerPage: number;
		defaultThumbnail: string;
		onUpload: (files: File[], albumId: number) => Promise<void>;
	} = $props();
</script>

<div class="items-left flex flex-row gap-4">
	<Button onclick={openCreateModal}>+</Button>
</div>

<CreateAlbumCard
	bind:open={creatingAlbum}
	album={currentAlbum}
	onOpenChange={(value) => {
		creatingAlbum = value;
	}}
/>

{#await albumsPromise}
	<AlbumsSkeleton albumCount={albumsPerPage} />
{:then albums}
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
							src={album.artworkPath || defaultThumbnail}
							alt={album.name}
							class="rounded-md object-cover"
						/>
					</AspectRatio>
					<div class="flex flex-row justify-between">
						<div class="mt-2 gap-2 flex flex-col">
							<p class="block text-sm font-medium">{album.name}</p>
							{#if album.artists && album.artists.length > 0}
								<p class="block text-xs text-muted-foreground">
									{album.artists.map((artist) => artist.name).join(', ')}
								</p>
							{/if}
						</div>
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
									<DropdownMenu.Item onclick={() => onClickEdit(album)}>Edit</DropdownMenu.Item>
									<DropdownMenu.Item style="color: red;" onclick={() => onDelete(album.id)}
										>Delete</DropdownMenu.Item
									>
								</DropdownMenu.Group>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				</FileDropZone>
			</div>
		{/each}
	</div>
{/await}
