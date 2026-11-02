<script lang="ts">
	import { untrack } from 'svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import CreateCard from '$lib/components/forms/create-card.svelte';
	import MultiArtistCombobox from '$lib/components/forms/multi-artist-combobox.svelte';
	import { getArtistsContext } from '$lib/contexts/artists-context';
	import type { AlbumSummary, FileUpload } from '$lib/ipc';
	import { loadArtworkPreviewBlob } from '$lib/utils/artwork-preview';
	import { fileToUpload } from '$lib/utils/file-upload';

	// Mount this card only while its dialog is open: the form state starts from `album`.
	let {
		open = $bindable(),
		album
	}: {
		open: boolean;
		album: AlbumSummary | null;
	} = $props();

	const { ipcActions, runtimeErrors } = getAppServicesContext();
	const artists = $derived(getArtistsContext());

	const initial = untrack(() => ({
		name: album?.name ?? '',
		artistIds: album?.artists.map((artist) => artist.id) ?? [],
		year: album?.year ?? null,
		genre: album?.genre ?? ''
	}));

	let file = $state<File | null>(null);
	let storedArtwork = $state<Blob | null>(null);
	let name = $state(initial.name);
	let selectedArtistIds = $state([...initial.artistIds]);
	let year = $state(initial.year);
	let genre = $state(initial.genre);

	$effect(() => {
		const artworkPath = album?.artworkPath;
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

	const handleUpload = (files: File[]) => {
		if (files.length === 0) return;
		file = files[0];
	};

	// Don't rewrite the album's files when nothing changed.
	const beforeSubmit = (): boolean => {
		const current = { name, artistIds: selectedArtistIds, year, genre };
		return !album || file !== null || JSON.stringify(current) !== JSON.stringify(initial);
	};

	async function handleSubmit(): Promise<void> {
		// Read the file first, so a read failure can't leave a saved album without its art.
		let artwork: FileUpload | null = null;
		if (file) {
			try {
				artwork = await fileToUpload(file);
			} catch (error) {
				runtimeErrors.notify(error, 'Read album art');
				throw error;
			}
		}

		let albumId: number;
		if (album) {
			albumId = album.id;
			await ipcActions.updateAlbum({
				id: albumId,
				name,
				year: year ?? undefined,
				genre: genre || undefined,
				artistIds: selectedArtistIds
			});
		} else {
			const newAlbum = await ipcActions.createAlbum({
				name,
				artistIds: selectedArtistIds,
				year: year ?? undefined,
				genre: genre || undefined
			});
			albumId = newAlbum.id;
		}

		if (artwork) {
			await ipcActions.uploadAlbumArt(albumId, artwork.filename, artwork.base64Data);
		}

		// Write tags last, so the files also get the new artwork.
		if (album) {
			await ipcActions.writeAlbumMetadata(albumId);
		}
	}
</script>

{#snippet albumFields(formLoading: boolean)}
	<div class="flex flex-col gap-6">
		<div class="grid gap-2">
			<Label for="name">Name</Label>
			<Input
				id="name"
				name="name"
				type="text"
				placeholder="Album Name"
				bind:value={name}
				required
				disabled={formLoading}
			/>
		</div>
		<div class="grid gap-2">
			<Label for="artist">Artist</Label>
			<MultiArtistCombobox
				{artists}
				bind:value={selectedArtistIds}
				disabled={formLoading}
				useProducerMode={false}
			/>
		</div>
		<div class="grid gap-2">
			<Label for="year">Year</Label>
			<Input
				id="year"
				name="year"
				type="number"
				placeholder="Year"
				bind:value={year}
				disabled={formLoading}
			/>
		</div>
		<div class="grid gap-2">
			<Label for="genre">Genre</Label>
			<Input
				id="genre"
				name="genre"
				type="text"
				placeholder="Genre"
				bind:value={genre}
				disabled={formLoading}
			/>
		</div>
	</div>
{/snippet}

<CreateCard
	bind:open
	title={album ? 'Edit Album' : 'Create Album'}
	formId="create-album-form"
	upload={{
		tabLabel: 'Album Art',
		placeholder: 'Upload Album Art',
		onUpload: handleUpload,
		limit: {
			maxFiles: 1,
			fileCount: file ? 1 : 0
		},
		preview: file ?? storedArtwork
	}}
	formFields={albumFields}
	submitLabel={album ? 'Save Changes' : 'Create'}
	{beforeSubmit}
	onSubmit={handleSubmit}
/>
