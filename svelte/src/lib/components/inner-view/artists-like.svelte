<script lang="ts" generics="T extends { id: number; name: string }">
	import { AspectRatio } from '$lib/components/ui/aspect-ratio/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import type { Component } from 'svelte';
	import type { Artist } from '$lib/wails';

	type EntityPromise = Promise<T[]>;
	type ArtistsPromise = Promise<Artist[]>;

	let {
		dataPromise,
		artistsPromise,
		entityType,
		showImages = true,
		defaultThumbnail = '/images/default-album.png',
		createCardComponent: CreateCardComponent,
		skeletonComponent: SkeletonComponent,
		resolveImage,
		onEdit,
		onDelete
	}: {
		dataPromise: EntityPromise;
		artistsPromise?: ArtistsPromise;
		entityType: string;
		showImages?: boolean;
		defaultThumbnail?: string;
		createCardComponent: Component<any>;
		skeletonComponent: Component<any>;
		resolveImage?: (entity: T) => string | null | undefined;
		onEdit?: (entity: T) => void;
		onDelete?: (id: number) => void;
	} = $props();

	let creatingEntity = $state(false);
	let resolvedArtists = $state<Artist[]>([]);

	// Resolve artists if provided
	$effect(() => {
		if (artistsPromise) {
			artistsPromise.then((artists) => {
				resolvedArtists = artists;
			});
		}
	});

	function getEntityImage(entity: T): string {
		if (!showImages) return '';
		if (resolveImage) {
			return resolveImage(entity) ?? defaultThumbnail;
		}
		return defaultThumbnail;
	}
</script>

<div class="items-left flex flex-row gap-4">
	<Button onclick={() => (creatingEntity = true)}>+</Button>
</div>

<CreateCardComponent
	bind:open={creatingEntity}
	onOpenChange={(value: boolean) => (creatingEntity = value)}
	artists={resolvedArtists}
/>

{#await dataPromise}
	<SkeletonComponent />
{:then entities}
	<div class="mt-4 flex flex-row flex-wrap gap-4">
		{#each entities as entity (entity.id)}
			{#if showImages}
				<div class="mb-4 flex w-[256px] flex-col gap-2 rounded border p-4">
					<AspectRatio ratio={1 / 1} class="bg-muted">
						<img
							src={getEntityImage(entity)}
							alt={entity.name}
							class="rounded-md object-cover"
						/>
					</AspectRatio>
					<div class="flex flex-row justify-between">
						<p class="mt-2 block text-sm font-medium">{entity.name}</p>
						{#if onEdit || onDelete}
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
										{#if onEdit}
											<DropdownMenu.Item onclick={() => onEdit(entity)}>Edit</DropdownMenu.Item>
										{/if}
										{#if onDelete}
											<DropdownMenu.Item style="color: red;" onclick={() => onDelete(entity.id)}
												>Delete</DropdownMenu.Item
											>
										{/if}
									</DropdownMenu.Group>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{/if}
					</div>
				</div>
			{:else}
				<div class="mb-4 w-[256px] rounded border p-4">
					<div class="flex flex-row justify-between">
						<p class="block text-sm font-medium">{entity.name}</p>
						{#if onEdit || onDelete}
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
										{#if onEdit}
											<DropdownMenu.Item onclick={() => onEdit(entity)}>Edit</DropdownMenu.Item>
										{/if}
										{#if onDelete}
											<DropdownMenu.Item style="color: red;" onclick={() => onDelete(entity.id)}
												>Delete</DropdownMenu.Item
											>
										{/if}
									</DropdownMenu.Group>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{/if}
					</div>
				</div>
			{/if}
		{/each}
	</div>
{/await}
