<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import CreateCard from './create-card.svelte';
	import { invalidateAll } from '$app/navigation';
	import MultiArtistCombobox from '$lib/components/ui/multi-artist-combobox.svelte';
	import { getArtistsContext } from '@/contexts/artists-context';

	let {
		open = $bindable(),
		onOpenChange
	}: { open: boolean; onOpenChange?: (open: boolean) => void } = $props();

	let loading = $state(false);
	let file = $state<File | null>(null);
	let blob: Blob | null = $derived.by(() => {
		return file ? new Blob([file], { type: file.type }) : null;
	});

	const artists = $derived(getArtistsContext());

	let selectedArtistIds = $state<number[]>([]);

	const handleUpload = async (files: File[]) => {
		if (files.length === 0) return;
		loading = true;
		file = files[0];
	};

	const callback = async (recordId: number) => {
		if (file) {
			loading = true;
			const formData = new FormData();
			formData.append('file', file);
			formData.append('type', 'album');
			formData.append('id', recordId.toString());
			await fetch('?/uploadArt', {
				method: 'POST',
				body: formData
			});
			loading = false;
			await invalidateAll();
		}
	};
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
				required
				disabled={formLoading}
			/>
		</div>
		<div class="grid gap-2">
			<Label for="artist">Artist</Label>
			<MultiArtistCombobox {artists} bind:value={selectedArtistIds} disabled={loading} />
		</div>
		<div class="grid gap-2">
			<Label for="year">Year</Label>
			<Input id="year" name="year" type="number" placeholder="Year" disabled={formLoading} />
		</div>
		<input type="hidden" name="artistIds" value={selectedArtistIds.join(',')} />
	</div>
{/snippet}

<CreateCard
	bind:open
	{onOpenChange}
	{callback}
	title="Create Album"
	formId="create-album-form"
	formAction="?/createAlbum"
	uploadTabLabel="Album Art"
	uploadPlaceholder="Upload Album Art"
	onFileUpload={handleUpload}
	uploadFieldImage={blob}
	formFields={albumFields}
/>
