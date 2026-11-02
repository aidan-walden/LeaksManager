<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import CreateCard from '$lib/components/forms/create-card.svelte';
	import MultiArtistCombobox from '$lib/components/forms/multi-artist-combobox.svelte';
	import { getArtistsContext } from '$lib/contexts/artists-context';
	import type { AlbumWithSongs, FileUpload } from '$lib/ipc';
	import { loadArtworkPreviewBlob } from '$lib/utils/artwork-preview';
	import { fileToUpload } from '$lib/utils/file-upload';

	let {
		open = $bindable(),
		onOpenChange,
		album
	}: {
		open: boolean;
		onOpenChange?: (open: boolean) => void;
		album: AlbumWithSongs | null;
	} = $props();

	let file = $state<File | null>(null);
	let blob = $state<Blob | null>(null);
	const { ipcActions, runtimeErrors } = getAppServicesContext();

	const artists = $derived(getArtistsContext());

	let selectedArtistIds = $state<number[]>([]);

	let initialValues = $state<{
		name: string;
		artistIds: number[];
		year: string;
		genre: string;
		hasFile: boolean;
	} | null>(null);

	$effect(() => {
		if (open) {
			if (album) {
				const artistIds = album.artists.map((artist) => artist.id);
				selectedArtistIds = [...artistIds];
				initialValues = {
					name: album.name,
					artistIds: [...artistIds],
					year: album.year !== null && album.year !== undefined ? String(album.year) : '',
					genre: album.genre !== null && album.genre !== undefined ? album.genre : '',
					hasFile: false
				};
			} else {
				selectedArtistIds = [];
				initialValues = null;
				blob = null;
			}

			file = null;
		} else {
			selectedArtistIds = [];
			initialValues = null;
			file = null;
			if (!album) {
				blob = null;
			}
		}
	});

	$effect(() => {
		if (!open || file) {
			return;
		}

		const artworkPath = album?.artworkPath;

		if (!artworkPath) {
			blob = null;
			return;
		}

		(async () => {
			const artworkBlob = await loadArtworkPreviewBlob(artworkPath);
			if (!artworkBlob) {
				return;
			}

			if (!file && album?.artworkPath === artworkPath) {
				blob = artworkBlob;
			}
		})();
	});

	$effect(() => {
		if (file) {
			blob = new Blob([file], { type: file.type });
		}
	});

	const handleUpload = (files: File[]) => {
		if (files.length === 0) return;
		file = files[0];
		if (initialValues) {
			initialValues.hasFile = true;
		}
	};

	const beforeSubmit = (): boolean => {
		if (!album || !initialValues) {
			return true;
		}

		const formElement = document.getElementById('create-album-form') as HTMLFormElement;
		if (!formElement) {
			return true;
		}

		const formData = new FormData(formElement);
		const currentName = formData.get('name') as string;
		const currentYear = (formData.get('year') as string) ?? '';
		const currentGenre = (formData.get('genre') as string) ?? '';

		const initial = initialValues;

		const nameChanged = currentName !== initial.name;
		const yearChanged = currentYear !== initial.year;
		const genreChanged = currentGenre !== initial.genre;
		const artistsChanged =
			selectedArtistIds.length !== initial.artistIds.length ||
			selectedArtistIds.some((id, index) => id !== initial.artistIds[index]);
		const fileChanged = initial.hasFile;

		return nameChanged || yearChanged || artistsChanged || genreChanged || fileChanged;
	};

	async function handleSubmit(formData: FormData): Promise<void> {
		const name = formData.get('name') as string;
		const yearStr = formData.get('year') as string;
		const genre = formData.get('genre') as string;

		const year = yearStr ? parseInt(yearStr) : undefined;

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
				year,
				genre: genre || undefined,
				artistIds: selectedArtistIds
			});
		} else {
			const newAlbum = await ipcActions.createAlbum({
				name,
				artistIds: selectedArtistIds,
				year,
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
				value={album ? album.name : ''}
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
				value={album && album.year !== null ? String(album.year) : ''}
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
				value={album && album.genre !== null ? album.genre : ''}
				disabled={formLoading}
			/>
		</div>
		{#if album}
			<input type="hidden" name="albumId" value={String(album.id)} />
		{/if}
		<input type="hidden" name="artistIds" value={selectedArtistIds.join(',')} />
	</div>
{/snippet}

<CreateCard
	bind:open
	{onOpenChange}
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
		preview: blob
	}}
	formFields={albumFields}
	submitLabel={album ? 'Save Changes' : 'Create'}
	{beforeSubmit}
	onSubmit={handleSubmit}
/>
