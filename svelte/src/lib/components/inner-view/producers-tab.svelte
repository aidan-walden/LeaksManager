<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import CreateProducerCard from '$lib/components/features/create-producer-card.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { invalidateAll } from '$app/navigation';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import type { EditableProducer } from '$lib/schema';
	import type { TabViewData } from '$lib/view-models/tab-data';

	type ProducerElement = TabViewData['producers'][number];
	type ArtistElement = TabViewData['artists'][number];

	let {
		producers,
		artists
	}: {
		producers: TabViewData['producers'];
		artists: TabViewData['artists'];
	} = $props();

	let dialogOpen = $state(false);
	let currentProducer = $state<EditableProducer | null>(null);
	let resolvedArtists = $state<ArtistElement[]>(artists);
	const { wailsActions } = getAppServicesContext();

	function openCreateModal() {
		currentProducer = null;
		dialogOpen = true;
	}

	function mapProducerToEditable(producer: ProducerElement): EditableProducer {
		return {
			id: producer.id,
			name: producer.name,
			producerAliases:
				producer.aliases?.map((alias) => ({
					id: alias.id,
					alias: alias.alias,
					producerAliasArtists:
						alias.artistIds?.map((artistId) => ({
							artistId,
							artist: null
						})) ?? []
				})) ?? []
		};
	}

	function onClickEdit(producer: ProducerElement) {
		currentProducer = mapProducerToEditable(producer);
		dialogOpen = true;
	}

	async function onDelete(id: number) {
		await wailsActions.deleteProducer(id);
		await invalidateAll();
	}
</script>

<div class="items-left flex flex-row gap-4">
	<Button onclick={openCreateModal}>+</Button>
</div>

<CreateProducerCard
	bind:open={dialogOpen}
	producer={currentProducer}
	onOpenChange={(value) => {
		dialogOpen = value;
		if (!value) {
			currentProducer = null;
		}
	}}
	artists={resolvedArtists}
/>

<div class="mt-4 flex flex-row flex-wrap gap-4">
	{#each producers as producer (producer.id)}
		<div class="mb-4 flex w-[256px] flex-col gap-2 rounded border p-4">
			<div class="flex items-start justify-between gap-2">
				<p class="block text-sm font-medium break-words">{producer.name}</p>
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
							<DropdownMenu.Item onclick={() => onClickEdit(producer)}>Edit</DropdownMenu.Item>
							<DropdownMenu.Item style="color: red;" onclick={() => onDelete(producer.id)}
								>Delete</DropdownMenu.Item
							>
						</DropdownMenu.Group>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
			{#if producer.aliases && producer.aliases.length > 0}
				<div class="mt-2 text-xs text-muted-foreground">
					<p class="font-semibold">Aliases</p>
					<ul class="mt-1 space-y-1">
						{#each producer.aliases as alias (alias.id)}
							<li>{alias.alias}</li>
						{/each}
					</ul>
				</div>
			{:else}
				<p class="mt-2 text-xs text-muted-foreground italic">No aliases</p>
			{/if}
		</div>
	{/each}
</div>
