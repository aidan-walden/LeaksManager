<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import CreateCard from '$lib/components/forms/create-card.svelte';
	import type { EditableSong } from '$lib/components/columns';
	import MultiArtistCombobox from '$lib/components/forms/multi-artist-combobox.svelte';
	import { getArtistsContext } from '$lib/contexts/artists-context';
	import { getProducersContext } from '$lib/contexts/producers-context';
	import { getAlbumsContext } from '$lib/contexts/albums-context';
	import type { Album, Song } from '$lib/wails';
	import { loadArtworkPreviewBlob } from '$lib/utils/artwork-preview';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	type AlbumWithSongs = Album & { songs: Song[] };

	let {
		open = $bindable(),
		onOpenChange,
		callback,
		song
	}: {
		open: boolean;
		onOpenChange?: (open: boolean) => void;
		callback?: () => void;
		song: EditableSong | null;
	} = $props();

	// Get artists from context
	const artists = $derived(getArtistsContext());
	const producers = $derived(getProducersContext());
	const albums = $derived(getAlbumsContext<AlbumWithSongs>());
	const { wailsActions } = getAppServicesContext();

	let file = $state<File | null>(null);
	let blob = $state<Blob | null>(null);
	let albumPopoverOpen = $state(false);

	// Update blob when file changes
	$effect(() => {
		if (file) {
			blob = new Blob([file], { type: file.type });
		}
	});

	$effect(() => {
		if (file || !song?.artworkPath) {
			if (!file) {
				blob = null;
			}
			return;
		}

		let cancelled = false;

		(async () => {
			const artworkBlob = await loadArtworkPreviewBlob(song.artworkPath);
			if (!cancelled) {
				blob = artworkBlob;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	// Store selected artist IDs
	let selectedArtistIds = $state<number[]>([]);
	let selectedProducerIds = $state<number[]>([]);
	let trackNumber = $state<number | null>(null);
	let manualTrackNumber = $state<number | null>(null);
	let songName = $state('');
	let albumName = $state('');
	let manualAlbumName = $state('');
	let isSingle = $state(false);

	function normalizeAlbumName(value: string) {
		return value.trim().toLocaleLowerCase();
	}

	function makeSingleAlbumName(title: string) {
		return `${title.trim()} - Single`;
	}

	function isSingleAlbum(title: string, album: string) {
		return normalizeAlbumName(album) === normalizeAlbumName(makeSingleAlbumName(title));
	}

	const matchedAlbum = $derived(
		albums.find((album) => normalizeAlbumName(album.name) === normalizeAlbumName(albumName)) ?? null
	);

	// Calculate total tracks in the selected album (including this song if editing)
	const totalTracks = $derived.by(() => {
		if (isSingle) return 1;
		if (!matchedAlbum) return 0;
		// Count songs in the album
		const songsInAlbum = matchedAlbum.songs?.length ?? 0;
		// If we're creating a new song and an album is selected, it will be added
		// If we're editing, the song is already counted
		return song ? songsInAlbum : songsInAlbum + 1;
	});

	// Track initial values for edit mode
	let initialValues = $state<{
		name: string;
		album: string;
		artistIds: number[];
		producerIds: number[];
		trackNumber: number | null;
		isSingle: boolean;
		hasFile: boolean;
	} | null>(null);

	// Capture initial values when dialog opens, reset when it closes
	$effect(() => {
		if (open) {
			// Dialog opened - capture current state
			if (song) {
				// Edit mode: capture initial values for change detection
				const artistIds = song.artists?.map((a) => a.id) ?? [];
				const producerIds = song.producers?.map((p) => p.id) ?? [];
				const single = isSingleAlbum(song.name, song.album?.name ?? '');
				selectedArtistIds = artistIds;
				selectedProducerIds = producerIds;

				trackNumber = song.trackNumber ?? null;
				manualTrackNumber = song.trackNumber ?? null;
				songName = song.name;
				albumName = song.album?.name ?? '';
				isSingle = single;
				manualAlbumName = single ? '' : (song.album?.name ?? '');

				initialValues = {
					name: song.name,
					album: song.album?.name || '',
					artistIds: [...artistIds],
					producerIds: [...producerIds],
					trackNumber: song.trackNumber ?? null,
					isSingle: single,
					hasFile: false
				};
			} else {
				// Create mode: reset to empty state
				selectedArtistIds = [];
				selectedProducerIds = [];
				trackNumber = null;
				manualTrackNumber = null;
				songName = '';
				albumName = '';
				manualAlbumName = '';
				isSingle = false;
				initialValues = null;
			}
			file = null;
		} else {
			// Dialog closed - reset state
			selectedArtistIds = [];
			selectedProducerIds = [];
			trackNumber = null;
			manualTrackNumber = null;
			songName = '';
			albumName = '';
			manualAlbumName = '';
			isSingle = false;
			initialValues = null;
			file = null;
		}
	});

	$effect(() => {
		if (!open) return;
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
		if (initialValues) {
			initialValues.hasFile = true;
		}
	};

	// Check if form values have changed (for edit mode only)
	const beforeSubmit = (): boolean => {
		// In create mode, always allow submission
		if (!song || !initialValues) {
			return true;
		}

		// Capture initial values to avoid null check issues
		const initial = initialValues;

		// Get current form values
		const currentName = songName;
		const currentAlbum = albumName;

		// Check if any values changed
		const nameChanged = currentName !== initial.name;
		const albumChanged = currentAlbum !== initial.album;
		const artistsChanged =
			selectedArtistIds.length !== initial.artistIds.length ||
			selectedArtistIds.some((id, index) => id !== initial.artistIds[index]);
		const trackNumberChanged = trackNumber !== initial.trackNumber;
		const producersChanged =
			selectedProducerIds.length !== initial.producerIds.length ||
			selectedProducerIds.some((id, index) => id !== initial.producerIds[index]);
		const singleChanged = isSingle !== initial.isSingle;

		const fileChanged = initial.hasFile;

		// Allow submission only if something changed
		return (
			nameChanged ||
			albumChanged ||
			artistsChanged ||
			trackNumberChanged ||
			producersChanged ||
			singleChanged ||
			fileChanged
		);
	};

	async function handleSubmit(formData: FormData): Promise<{ id?: number }> {
		if (!song) {
			throw new Error('Song editing requires an existing song');
		}

		// update existing song
		await wailsActions.updateSong({
			id: song.id,
			name: songName,
			albumName: albumName.trim() || undefined,
			artistIds: selectedArtistIds,
			producerIds: selectedProducerIds,
			trackNumber: trackNumber ?? undefined
		});

		// write metadata to disk
		await wailsActions.writeSongMetadata(song.id);

		return { id: song.id };
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
								{#each albums as album (album.id)}
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
					placeholder={song?.trackNumber?.toString() ?? ''}
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
	{onOpenChange}
	{callback}
	title={song ? 'Edit Song' : 'Create Song'}
	formId="create-song-form"
	upload={{
		tabLabel: 'Song Art',
		placeholder: 'Upload Song Art',
		onUpload: handleUpload,
		limit: {
			maxFiles: 1,
			fileCount: file ? 1 : 0
		},
		preview: blob
	}}
	formFields={songFields}
	submitLabel={song ? 'Save Changes' : 'Create'}
	{beforeSubmit}
	onSubmit={handleSubmit}
/>
