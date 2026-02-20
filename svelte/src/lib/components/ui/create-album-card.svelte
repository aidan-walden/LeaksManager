<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import CreateCard from './create-card.svelte';
	import { invalidateAll } from '$app/navigation';
	import MultiArtistCombobox from '$lib/components/ui/multi-artist-combobox.svelte';
	import { getArtistsContext } from '@/contexts/artists-context';
	import type { EditableAlbum } from '@/schema';
	import {
		CreateAlbum,
		UpdateAlbum,
		UploadAlbumArt,
		WriteAlbumMetadata
	} from '$lib/wails';
	import { toAssetUrl } from '$lib/utils';

	let {
		open = $bindable(),
		onOpenChange,
		album
	}: {
		open: boolean;
		onOpenChange?: (open: boolean) => void;
		album: EditableAlbum | null;
	} = $props();

	let loading = $state(false);
	let file = $state<File | null>(null);
	let blob = $state<Blob | null>(null);

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
				const artistIds = (album.albumArtists ?? []).map((aa) => aa.artistId);
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
			try {
				const response = await fetch(toAssetUrl(artworkPath) ?? '');
				if (!response.ok) return;
				const artworkBlob = await response.blob();

				if (!file && album?.artworkPath === artworkPath) {
					blob = artworkBlob;
				}
			} catch (error) {
				console.error('Failed to fetch album artwork:', error);
			}
		})();
	});

	$effect(() => {
		if (file) {
			blob = new Blob([file], { type: file.type });
		}
	});

	const handleUpload = async (files: File[]) => {
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

	const callback = async (recordId?: number) => {
		const currentFile = file;
		if (!currentFile) {
			return;
		}

		const albumId = recordId ?? album?.id;
		if (!albumId) {
			return;
		}

		loading = true;

		try {
			// convert file to base64
			const arrayBuffer = await currentFile.arrayBuffer();
			const base64 = btoa(
				new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
			);
			await UploadAlbumArt(albumId, currentFile.name, base64);
			await invalidateAll();
		} finally {
			loading = false;
		}
	};

	async function handleSubmit(formData: FormData): Promise<{ id?: number }> {
		const name = formData.get('name') as string;
		const yearStr = formData.get('year') as string;
		const genre = formData.get('genre') as string;

		const year = yearStr ? parseInt(yearStr) : undefined;

		if (album) {
			// update existing album
			await UpdateAlbum({
				id: album.id,
				name,
				year,
				genre: genre || undefined,
				artistIds: selectedArtistIds
			});

			// write metadata to all songs in album
			await WriteAlbumMetadata(album.id);

			return { id: album.id };
		} else {
			// create new album
			const newAlbum = await CreateAlbum({
				name,
				artistIds: selectedArtistIds,
				year,
				genre: genre || undefined
			});

			return { id: newAlbum.id };
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
				disabled={loading || formLoading}
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
	{callback}
	title={album ? 'Edit Album' : 'Create Album'}
	formId="create-album-form"
	uploadTabLabel="Album Art"
	uploadPlaceholder="Upload Album Art"
	onFileUpload={handleUpload}
	uploadFieldImage={blob}
	formFields={albumFields}
	submitLabel={album ? 'Save Changes' : 'Create'}
	{beforeSubmit}
	onSubmit={handleSubmit}
/>
