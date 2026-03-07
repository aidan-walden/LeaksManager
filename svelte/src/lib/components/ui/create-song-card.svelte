<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import CreateCard from './create-card.svelte';
	import type { EditableSong } from '../columns';
	import MultiArtistCombobox from '$lib/components/ui/multi-artist-combobox.svelte';
	import { getArtistsContext } from '$lib/contexts/artists-context';
	import { getProducersContext } from '$lib/contexts/producers-context';
	import { getAlbumsContext } from '$lib/contexts/albums-context';
	import { onMount } from 'svelte';
	import { UpdateSong, WriteSongMetadata, type Album, type Song } from '$lib/wails';
	import { toAssetUrl } from '$lib/utils';

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

	let file = $state<File | null>(null);
	let blob = $state<Blob | null>(null);

	// Fetch artwork blob on mount if song has artwork
	onMount(async () => {
		if (song && song.artworkPath) {
			try {
				const response = await fetch(toAssetUrl(song.artworkPath) ?? '');
				const artworkBlob = await response.blob();
				blob = artworkBlob;
			} catch (error) {
				console.error('Failed to fetch artwork:', error);
			}
		}
	});

	// Update blob when file changes
	$effect(() => {
		if (file) {
			blob = new Blob([file], { type: file.type });
		}
	});

	// Store selected artist IDs
	let selectedArtistIds = $state<number[]>([]);
	let selectedProducerIds = $state<number[]>([]);
	let trackNumber = $state<number | null>(null);
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
				selectedArtistIds = artistIds;
				selectedProducerIds = producerIds;

				trackNumber = song.trackNumber ?? null;
				songName = song.name;
				albumName = song.album?.name ?? '';
				isSingle = isSingleAlbum(song.name, song.album?.name ?? '');
				manualAlbumName = isSingle ? '' : song.album?.name ?? '';

				initialValues = {
					name: song.name,
					album: song.album?.name || '',
					artistIds: [...artistIds],
					producerIds: [...producerIds],
					trackNumber: song.trackNumber ?? null,
					isSingle,
					hasFile: false
				};
			} else {
				// Create mode: reset to empty state
				selectedArtistIds = [];
				selectedProducerIds = [];
				trackNumber = null;
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

	const handleUpload = async (files: File[]) => {
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
		await UpdateSong({
			id: song.id,
			name: songName,
			albumName: albumName.trim() || undefined,
			artistIds: selectedArtistIds,
			producerIds: selectedProducerIds,
			trackNumber: trackNumber ?? undefined
		});

		// write metadata to disk
		await WriteSongMetadata(song.id);

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
			<Input
				id="album"
				name="album"
				type="text"
				list="song-album-suggestions"
				placeholder="Album Name"
				bind:value={albumName}
				disabled={loading || isSingle}
			/>
			<datalist id="song-album-suggestions">
				{#each albums as album (album.id)}
					<option value={album.name}></option>
				{/each}
			</datalist>
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
					} else {
						albumName = manualAlbumName;
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
					disabled={loading || (!albumName.trim() && !isSingle)}
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
	uploadTabLabel="Song Art"
	uploadPlaceholder="Upload Song Art"
	formFields={songFields}
	onFileUpload={handleUpload}
	uploadFieldImage={blob}
	submitLabel={song ? 'Save Changes' : 'Create'}
	{beforeSubmit}
	onSubmit={handleSubmit}
/>
