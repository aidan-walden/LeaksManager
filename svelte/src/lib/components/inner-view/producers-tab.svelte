<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import CreateProducerCard from '$lib/components/features/create-producer-card.svelte';
	import EntityActionsMenu from '$lib/components/shared/entity-actions-menu.svelte';
	import { invalidateAll } from '$app/navigation';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import type { TabViewData } from '$lib/view-models/tab-data';

	type ProducerElement = TabViewData['producers'][number];

	let {
		producers,
		artists
	}: {
		producers: TabViewData['producers'];
		artists: TabViewData['artists'];
	} = $props();

	let dialogOpen = $state(false);
	let currentProducer = $state<ProducerElement | null>(null);
	const { ipcActions } = getAppServicesContext();

	function openCreateModal() {
		currentProducer = null;
		dialogOpen = true;
	}

	function onClickEdit(producer: ProducerElement) {
		currentProducer = producer;
		dialogOpen = true;
	}

	async function onDelete(id: number) {
		await ipcActions.deleteProducer(id);
		await invalidateAll();
	}
</script>

<div class="items-left flex flex-row gap-4">
	<Button onclick={openCreateModal}>+</Button>
</div>

{#if dialogOpen}
	<CreateProducerCard bind:open={dialogOpen} producer={currentProducer} {artists} />
{/if}

<div class="mt-4 flex flex-row flex-wrap gap-4">
	{#each producers as producer (producer.id)}
		<div class="mb-4 flex w-[256px] flex-col gap-2 rounded border p-4">
			<div class="flex items-start justify-between gap-2">
				<p class="block text-sm font-medium break-words">{producer.name}</p>
				<EntityActionsMenu
					onEdit={() => onClickEdit(producer)}
					onDelete={() => onDelete(producer.id)}
				/>
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
