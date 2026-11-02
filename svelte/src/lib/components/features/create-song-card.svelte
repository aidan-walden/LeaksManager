<script lang="ts">
	import { untrack } from 'svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import CreateCard from '$lib/components/forms/create-card.svelte';
	import MultiArtistCombobox from '$lib/components/forms/multi-artist-combobox.svelte';
	import { page } from '$app/state';
	import type { SongReadable } from '$lib/ipc';
	import { loadArtworkPreviewBlob } from '$lib/utils/artwork-preview';
	import { notifyTagWriteFailures } from '$lib/utils/tag-write-failures';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	// Mount this card only while its dialog is open: the form state starts from `song`.
	let {
		open = $bindable(),
		song
	}: {
		open: boolean;
		song: SongReadable;
	} = $props();

	const artists = $derived(page.data.artists);
	const producers = $derived(page.data.producers);
	const albums = $derived(page.data.albums);
	const { ipcActions } = getAppServicesContext();

	const initial = untrack(() => ({
		name: song.name,
		album: song.album?.name ?? '',
		artistIds: song.artists.map((a) => a.id),
		producerIds: song.producers.map((p) => p.id),
		trackNumber: song.trackNumber,
		isSingle: song.album?.isSingle ?? false
	}));

	let file = $state<File | null>(null);
	let storedArtwork = $state<Blob | null>(null);
	let albumPopoverOpen = $state(false);
	let songName = $state(initial.name);
	let albumName = $state(initial.album);
	let manualAlbumName = $state(initial.isSingle ? '' : initial.album);
	let selectedArtistIds = $state([...initial.artistIds]);
	let selectedProducerIds = $state([...initial.producerIds]);
	let trackNumber = $state(initial.trackNumber);
	let manualTrackNumber = $state(initial.trackNumber);
	let isSingle = $state(initial.isSingle);

	// The song's own artwork, or the artwork it inherits from its album.
	const artworkPath = $derived(song.artworkPath ?? song.album?.artworkPath ?? null);

	$effect(() => {
		if (!artworkPath) {
			storedArtwork = null;
			return;
		}

		let cancelled = false;
		loadArtworkPreviewBlob(artworkPath).then((artwork) => {
			if (!cancelled) storedArtwork = artwork;
		});
		return () => {
			cancelled = true;
		};
	});

	function normalizeAlbumName(value: string) {
		return value.trim().toLocaleLowerCase();
	}

	function makeSingleAlbumName(title: string) {
		return `${title.trim()} - Single`;
	}

	const nonSingleAlbums = $derived(albums.filter((album) => !album.isSingle));

	const matchedAlbum = $derived(
		albums.find((album) => normalizeAlbumName(album.name) === normalizeAlbumName(albumName)) ?? null
	);

	const totalTracks = $derived(isSingle ? 1 : (matchedAlbum?.songCount ?? 0));

	$effect(() => {
		if (isSingle) {
			albumName = makeSingleAlbumName(songName);
			return;
		}

		if (albumName !== manualAlbumName) {
			manualAlbumName = albumName;
		}
	});

	const handleUpload = (files: File[]) => {
		if (files.length === 0) return;
		file = files[0];
	};

	// Don't rewrite the song or its file when nothing changed.
	const beforeSubmit = (): boolean => {
		const current = {
			name: songName,
			album: albumName,
			artistIds: selectedArtistIds,
			producerIds: selectedProducerIds,
			trackNumber,
			isSingle
		};
		return file !== null || JSON.stringify(current) !== JSON.stringify(initial);
	};

	async function handleSubmit(): Promise<void> {
		await ipcActions.updateSong({
			id: song.id,
			name: songName,
			albumName: albumName.trim() || undefined,
			artistIds: selectedArtistIds,
			producerIds: selectedProducerIds,
			trackNumber: trackNumber ?? undefined,
			isSingle
		});

		// write metadata to disk
		const { success } = await ipcActions.writeSongMetadata(song.id);
		notifyTagWriteFailures({ songsFailed: success ? 0 : 1 });
	}
</script>

{#snippet songFields(loading: boolean)}
	<div class="flex flex-col gap-6">
		<div class="grid gap-2">
			<Label for="name">Name</Label>
			<Input
				id="name"
				name="name"
				type="text"
				placeholder="Song Name"
				bind:value={songName}
				required
				disabled={loading}
			/>
		</div>
		<div class="grid gap-2">
			<Label for="artist">Artist</Label>
			<MultiArtistCombobox
				{artists}
				useProducerMode={false}
				bind:value={selectedArtistIds}
				disabled={loading}
			/>
		</div>
		<div class="grid gap-2">
			<Label for="producer">Producer</Label>
			<MultiArtistCombobox
				artists={producers}
				bind:value={selectedProducerIds}
				useProducerMode={true}
				disabled={loading}
			/>
		</div>
		<div class="grid gap-2">
			<Label>Album</Label>
			<Popover.Root bind:open={albumPopoverOpen}>
				<Popover.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="outline"
							class="h-auto min-h-[36px] w-full justify-start"
							role="combobox"
							aria-expanded={albumPopoverOpen}
							disabled={loading || isSingle}
						>
							<div class="flex flex-1 items-center">
								{#if albumName}
									<span>{albumName}</span>
								{:else}
									<span class="text-muted-foreground">Select album...</span>
								{/if}
							</div>
							<ChevronsUpDownIcon class="ml-2 h-4 w-4 shrink-0 opacity-50" />
						</Button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content class="w-[400px] p-0">
					<Command.Root>
						<Command.Input
							placeholder="Search or type album name..."
							bind:value={albumName}
							onkeydown={(e) => {
								if (e.key === 'Enter' && albumName.trim()) {
									albumPopoverOpen = false;
								}
							}}
						/>
						<Command.List>
							<Command.Empty>Type to set a custom album name.</Command.Empty>
							<Command.Group>
								{#each nonSingleAlbums as album (album.id)}
									<Command.Item
										value={album.name}
										onSelect={() => {
											albumName = album.name;
											albumPopoverOpen = false;
										}}
									>
										<CheckIcon
											class={cn(
												'mr-2 h-4 w-4',
												albumName !== album.name && 'text-transparent'
											)}
										/>
										{album.name}
									</Command.Item>
								{/each}
							</Command.Group>
						</Command.List>
					</Command.Root>
				</Popover.Content>
			</Popover.Root>
		</div>
		<div class="flex items-center gap-3">
			<Checkbox
				id="song-is-single"
				checked={isSingle}
				disabled={loading}
				onCheckedChange={(checked) => {
					const nextChecked = checked === true;
					if (nextChecked === isSingle) return;

					if (nextChecked) {
						manualAlbumName = albumName;
						albumName = makeSingleAlbumName(songName);
						manualTrackNumber = trackNumber;
						trackNumber = 1;
					} else {
						albumName = manualAlbumName;
						trackNumber = manualTrackNumber;
					}

					isSingle = nextChecked;
				}}
			/>
			<Label for="song-is-single">Song is a single</Label>
		</div>
		<div class="grid gap-2">
			<Label for="track-number">Track Number</Label>
			<div class="flex items-center gap-2">
				<span class="text-sm text-muted-foreground">Track</span>
				<Input
					id="track-number"
					name="trackNumber"
					type="number"
					min="1"
					placeholder={song.trackNumber?.toString() ?? ''}
					bind:value={trackNumber}
					disabled={loading || isSingle || (!albumName.trim() && !isSingle)}
					class="w-20"
				/>
				<span class="text-sm text-muted-foreground">of</span>
				<Input type="number" value={totalTracks} disabled class="w-20" readonly />
			</div>
		</div>
	</div>
{/snippet}

<CreateCard
	bind:open
	title="Edit Song"
	formId="create-song-form"
	upload={{
		tabLabel: 'Song Art',
		placeholder: 'Upload Song Art',
		onUpload: handleUpload,
		limit: {
			maxFiles: 1,
			fileCount: file ? 1 : 0
		},
		preview: file ?? storedArtwork
	}}
	formFields={songFields}
	submitLabel="Save Changes"
	{beforeSubmit}
	onSubmit={handleSubmit}
/>
