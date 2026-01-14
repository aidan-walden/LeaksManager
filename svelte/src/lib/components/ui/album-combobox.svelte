<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import XIcon from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils/utils.js';
	import type { Album } from '$lib/wails';

	let {
		albums,
		value = $bindable<number | null>(null),
		disabled = false,
		placeholder = 'Select album...'
	}: {
		albums: (Album & { albumArtists?: { artist: { name: string } }[] })[];
		value?: number | null;
		disabled?: boolean;
		placeholder?: string;
	} = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement>(null!);

	const selectedAlbum = $derived(
		albums.find((album) => album.id === value) ?? null
	);

	function selectAlbum(albumId: number) {
		value = albumId;
		closeAndFocusTrigger();
	}

	function clearSelection(event?: MouseEvent) {
		event?.stopPropagation();
		value = null;
		closeAndFocusTrigger();
	}

	function closeAndFocusTrigger() {
		open = false;
		tick().then(() => {
			triggerRef?.focus();
		});
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger bind:ref={triggerRef}>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="w-full justify-between"
				role="combobox"
				aria-expanded={open}
				{disabled}
			>
				<span class="truncate text-left">
					{#if selectedAlbum}
						{selectedAlbum.name}
					{:else}
						<span class="text-muted-foreground">{placeholder}</span>
					{/if}
				</span>
				<span class="ml-2 flex items-center gap-1">
					{#if selectedAlbum}
						<button
							type="button"
							class="rounded-full p-1 hover:bg-accent hover:text-accent-foreground"
							onclick={clearSelection}
						>
							<XIcon class="h-3 w-3" />
							<span class="sr-only">Clear selection</span>
						</button>
					{/if}
					<ChevronsUpDownIcon class="h-4 w-4 opacity-50" />
				</span>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[400px] p-0">
		<Command.Root>
			<Command.Input placeholder="Search albums..." />
			<Command.List>
				<Command.Empty>No album found.</Command.Empty>
				<Command.Group>
					{#each albums as album (album.id)}
						<Command.Item
							value={album.name}
							onSelect={() => {
								selectAlbum(album.id);
							}}
						>
							<CheckIcon
								class={cn(
									'mr-2 h-4 w-4',
									selectedAlbum?.id !== album.id && 'text-transparent'
								)}
							/>
							<div class="flex flex-col">
								<span>{album.name}</span>
								{#if album.albumArtists && album.albumArtists.length > 0}
									<span class="text-xs text-muted-foreground">
										{album.albumArtists.map((relation) => relation.artist.name).join(', ')}
									</span>
								{/if}
							</div>
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
