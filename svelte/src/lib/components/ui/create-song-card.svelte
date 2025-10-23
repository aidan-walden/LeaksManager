<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import CreateCard from './create-card.svelte';
	import type { EditableSong } from '../columns';
	import MultiArtistCombobox from '$lib/components/ui/multi-artist-combobox.svelte';
	import { getArtistsContext } from '$lib/contexts/artists-context';
	import { onMount } from 'svelte';

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
	const artists = getArtistsContext();

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

	// Track initial values for edit mode
	let initialValues = $state<{
		name: string;
		album: string;
		artistIds: number[];
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
				initialValues = {
					name: song.name,
					album: song.album?.name || '',
					artistIds: [...artistIds],
					hasFile: false
				};
			} else {
				// Create mode: reset to empty state
				selectedArtistIds = [];
				initialValues = null;
			}
			file = null;
		} else {
			// Dialog closed - reset state
			selectedArtistIds = [];
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
		const albumChanged = currentAlbum !== initial.album;
		const artistsChanged =
			selectedArtistIds.length !== initial.artistIds.length ||
			selectedArtistIds.some((id, index) => id !== initial.artistIds[index]);
		const fileChanged = initial.hasFile;

		// Allow submission only if something changed
		return nameChanged || albumChanged || artistsChanged || fileChanged;
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
			<Label for="album">Album</Label>
			<Input
				id="album"
				name="album"
				type="text"
				placeholder="Album Name"
				value={song ? song.album?.name : ''}
				required
				disabled={loading}
			/>
		</div>
		{#if song}
			<input type="hidden" name="songId" value={song.id} />
		{/if}
		<input type="hidden" name="artistIds" value={selectedArtistIds.join(',')} />
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
