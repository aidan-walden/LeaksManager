<script lang="ts" generics="T extends { id: number; name: string }">
	import { AspectRatio } from '$lib/components/ui/aspect-ratio/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import EntityActionsMenu from '$lib/components/shared/entity-actions-menu.svelte';
	import type { Component } from 'svelte';

	let {
		data,
		entityType,
		defaultThumbnail = '/images/default-album.png',
		createCardComponent: CreateCardComponent,
		resolveImage,
		onEdit,
		onDelete
	}: {
		data: T[];
		entityType: string;
		defaultThumbnail?: string;
		createCardComponent: Component<any>;
		resolveImage?: (entity: T) => string | null | undefined;
		onEdit: (entity: T) => void;
		onDelete: (id: number) => void;
	} = $props();

	let creatingEntity = $state(false);

	function getEntityImage(entity: T): string {
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
/>

<div class="mt-4 flex flex-row flex-wrap gap-4">
	{#each data as entity (entity.id)}
		<div class="mb-4 flex w-[256px] flex-col gap-2 rounded border p-4">
			<AspectRatio ratio={1 / 1} class="bg-muted">
				<img src={getEntityImage(entity)} alt={entity.name} class="rounded-md object-cover" />
			</AspectRatio>
			<div class="flex flex-row justify-between">
				<p class="mt-2 block text-sm font-medium">{entity.name}</p>
				<EntityActionsMenu
					label={`${entityType} Actions`}
					onEdit={() => onEdit(entity)}
					onDelete={() => onDelete(entity.id)}
				/>
			</div>
		</div>
	{/each}
</div>
