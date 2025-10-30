<script lang="ts" generics="T extends { id: number; name: string }">
	import { AspectRatio } from '$lib/components/ui/aspect-ratio/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Component } from 'svelte';
	import type { Artist } from '$lib/server/db/schema';

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
		resolveImage
	}: {
		dataPromise: EntityPromise;
		artistsPromise?: ArtistsPromise;
		entityType: string;
		showImages?: boolean;
		defaultThumbnail?: string;
		createCardComponent: Component<any>;
		skeletonComponent: Component<any>;
		resolveImage?: (entity: T) => string | null | undefined;
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
				<div class="mb-4 w-[256px] rounded border p-4">
					<AspectRatio ratio={1 / 1} class="bg-muted">
						<img
							src={getEntityImage(entity)}
							alt={entity.name}
							class="rounded-md object-cover"
						/>
					</AspectRatio>
					<p class="mt-2 block text-sm font-medium">{entity.name}</p>
				</div>
			{:else}
				<div class="mb-4 w-[256px] rounded border p-4">
					<p class="block text-sm font-medium">{entity.name}</p>
				</div>
			{/if}
		{/each}
	</div>
{/await}
