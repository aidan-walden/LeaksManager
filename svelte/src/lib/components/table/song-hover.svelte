<script lang="ts">
	import type { EditableSong } from '@/components/columns';
	import * as HoverCard from '$lib/components/ui/hover-card/index.js';

	let { song }: { song: EditableSong } = $props();

	let songProducersString = $derived(
		song.songProducers
			?.map((sp) => sp.producer?.name)
			.filter((name): name is string => name !== undefined)
			.join(', ') ?? ''
	);

	let open = $state(false);

	// close on scroll
	$effect(() => {
		if (!open) return;

		const handleScroll = () => {
			open = false;
		};

		window.addEventListener('scroll', handleScroll, true);

		return () => {
			window.removeEventListener('scroll', handleScroll, true);
		};
	});
</script>

<HoverCard.Root bind:open>
	<HoverCard.Trigger
		target="_blank"
		rel="noreferrer noopener"
		class="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-black"
	>
		{song.name}
	</HoverCard.Trigger>
	<HoverCard.Content class="w-80">
		<div class="grid grid-cols-3 gap-4">
			<div class="col-span-2 space-y-1">
				<h4 class="text-sm font-semibold">{song.name}</h4>
				<p class="text-sm text-muted-foreground italic">{song.artist}</p>
				{#if songProducersString}
					<div class="flex items-center pt-2">
						<span class="text-xs text-muted-foreground">Prod. {songProducersString}</span>
					</div>
				{/if}
				{#if song.album?.name}
					<div class="flex items-center pt-2">
						<span class="text-xs text-muted-foreground">{song.album?.name}</span>
					</div>
				{/if}
			</div>
			{#if song.album?.artworkPath}
				<img class="col-start-3" src={song.album.artworkPath} alt="Album Art" />
			{/if}
		</div>
	</HoverCard.Content>
</HoverCard.Root>
