<script lang="ts" generics="T extends { id: number; name: string }">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import XIcon from '@lucide/svelte/icons/x';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { cn } from '$lib/utils/utils.js';

	let {
		artists,
		value = $bindable([]),
		disabled = false,
		useProducerMode = false
	}: {
		artists: T[];
		value?: number[];
		disabled?: boolean;
		useProducerMode: boolean;
	} = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement>(null!);

	const selectedArtists = $derived(artists.filter((artist) => value.includes(artist.id)));

	function toggleArtist(artistId: number) {
		if (value.includes(artistId)) {
			value = value.filter((id) => id !== artistId);
		} else {
			value = [...value, artistId];
		}
	}

	function removeArtist(artistId: number, event?: MouseEvent) {
		event?.stopPropagation();
		value = value.filter((id) => id !== artistId);
	}

	const placeholder = useProducerMode ? 'Select producers...' : 'Select artists...';
	const searchPlaceholcer = useProducerMode ? 'Search producers...' : 'Search artists...';
</script>

<Popover.Root bind:open>
	<Popover.Trigger bind:ref={triggerRef}>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="h-auto min-h-[36px] w-full justify-start"
				role="combobox"
				aria-expanded={open}
				{disabled}
			>
				<div class="flex flex-1 flex-wrap items-center gap-1">
					{#if selectedArtists.length === 0}
						<span class="text-muted-foreground">{placeholder}</span>
					{:else}
						{#each selectedArtists as artist (artist.id)}
							<Badge variant="secondary" class="gap-1">
								{artist.name}
								<button
									type="button"
									class="ml-1 rounded-full ring-offset-background outline-none hover:bg-accent hover:text-accent-foreground"
									onclick={(e) => removeArtist(artist.id, e)}
								>
									<XIcon class="h-3 w-3" />
									<span class="sr-only">Remove {artist.name}</span>
								</button>
							</Badge>
						{/each}
					{/if}
				</div>
				<ChevronsUpDownIcon class="ml-2 h-4 w-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[400px] p-0">
		<Command.Root>
			<Command.Input placeholder={searchPlaceholcer} />
			<Command.List>
				<Command.Empty>No artist found.</Command.Empty>
				<Command.Group>
					{#each artists as artist (artist.id)}
						<Command.Item
							value={artist.name}
							onSelect={() => {
								toggleArtist(artist.id);
							}}
						>
							<CheckIcon
								class={cn('mr-2 h-4 w-4', !value.includes(artist.id) && 'text-transparent')}
							/>
							{artist.name}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
