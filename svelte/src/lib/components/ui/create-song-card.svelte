<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import CreateCard from './create-card.svelte';
	import type { EditableSong } from '../columns';
	import MultiArtistCombobox from '$lib/components/ui/multi-artist-combobox.svelte';
	import { getArtistsContext } from '$lib/contexts/artists-context';
	import AlbumCombobox from '$lib/components/ui/album-combobox.svelte';
	import { getAlbumsContext } from '$lib/contexts/albums-context';
	import { onMount } from 'svelte';
	import type { Album, Song } from '@/server/db/schema';

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
	const albums = $derived(getAlbumsContext<AlbumWithSongs>());

	let file = $state<File | null>(null);
	let blob = $state<Blob | null>(null);

	// Fetch artwork blob on mount if song has artwork
	onMount(async () => {
		if (song && song.artworkPath) {
			try {
				const response = await fetch(song.artworkPath);
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
	let selectedAlbumId = $state<number | null>(null);
	let trackNumber = $state<number | null>(null);

	const selectedAlbum = $derived(albums.find((album) => album.id === selectedAlbumId) ?? null);
	const selectedAlbumName = $derived(selectedAlbum?.name ?? '');

	// Calculate total tracks in the selected album (including this song if editing)
	const totalTracks = $derived.by(() => {
		if (!selectedAlbum) return 0;
		// Count songs in the album
		const songsInAlbum = selectedAlbum.songs?.length ?? 0;
		// If we're creating a new song and an album is selected, it will be added
		// If we're editing, the song is already counted
		return song ? songsInAlbum : songsInAlbum + 1;
	});

	// Track initial values for edit mode
	let initialValues = $state<{
		name: string;
		album: string;
		albumId: number | null;
		artistIds: number[];
		trackNumber: number | null;
		hasFile: boolean;
	} | null>(null);

	// Capture initial values when dialog opens, reset when it closes
	$effect(() => {
		if (open) {
			// Dialog opened - capture current state
			if (song) {
				// Edit mode: capture initial values for change detection
				const artistIds = song.songArtists.map((sa) => sa.artistId);
				selectedArtistIds = artistIds;
				selectedAlbumId = song.album ? song.album.id : null;
				trackNumber = song.trackNumber ?? null;

				initialValues = {
					name: song.name,
					album: song.album?.name || '',
					albumId: song.album ? song.album.id : null,
					artistIds: [...artistIds],
					trackNumber: song.trackNumber ?? null,
					hasFile: false
				};
			} else {
				// Create mode: reset to empty state
				selectedArtistIds = [];
				selectedAlbumId = null;
				trackNumber = null;
				initialValues = null;
			}
			file = null;
		} else {
			// Dialog closed - reset state
			selectedArtistIds = [];
			selectedProducerIds = [];
			selectedAlbumId = null;
			trackNumber = null;
			initialValues = null;
			file = null;
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
		const formElement = document.getElementById('create-song-form') as HTMLFormElement;
		if (!formElement) return true;

		const formData = new FormData(formElement);
		const currentName = formData.get('name') as string;
		const currentAlbum = formData.get('album') as string;

		// Check if any values changed
		const nameChanged = currentName !== initial.name;
		const albumChanged =
			currentAlbum !== initial.album || (selectedAlbumId ?? null) !== initial.albumId;
		const artistsChanged =
			selectedArtistIds.length !== initial.artistIds.length ||
			selectedArtistIds.some((id, index) => id !== initial.artistIds[index]);
		const trackNumberChanged = trackNumber !== initial.trackNumber;

		const fileChanged = initial.hasFile;

		// Allow submission only if something changed
		return nameChanged || albumChanged || artistsChanged || trackNumberChanged || fileChanged;
	};
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
				value={song ? song.name : ''}
				required
				disabled={loading}
			/>
		</div>
		<div class="grid gap-2">
			<Label for="artist">Artist</Label>
			<MultiArtistCombobox {artists} bind:value={selectedArtistIds} disabled={loading} />
		</div>
		<div class="grid gap-2">
			<Label>Album</Label>
			<AlbumCombobox {albums} bind:value={selectedAlbumId} disabled={loading} />
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
					disabled={loading || !selectedAlbumId}
					class="w-20"
				/>
				<span class="text-sm text-muted-foreground">of</span>
				<Input
					type="number"
					value={totalTracks}
					disabled
					class="w-20"
					readonly
				/>
			</div>
		</div>
		{#if song}
			<input type="hidden" name="songId" value={song.id} />
		{/if}
		<input type="hidden" name="album" value={selectedAlbumName} />
		<input
			type="hidden"
			name="albumId"
			value={selectedAlbumId !== null ? String(selectedAlbumId) : ''}
		/>
		<input type="hidden" name="artistIds" value={selectedArtistIds.join(',')} />
		<input type="hidden" name="producerIds" value={selectedProducerIds.join(',')} />
	</div>
{/snippet}

<CreateCard
	bind:open
	{onOpenChange}
	{callback}
	title={song ? 'Edit Song' : 'Create Song'}
	formId="create-song-form"
	formAction={song ? '?/updateSong' : '?/createSong'}
	uploadTabLabel="Song Art"
	uploadPlaceholder="Upload Song Art"
	formFields={songFields}
	onFileUpload={handleUpload}
	uploadFieldImage={blob}
	submitLabel={song ? 'Save Changes' : 'Create'}
	{beforeSubmit}
/>
