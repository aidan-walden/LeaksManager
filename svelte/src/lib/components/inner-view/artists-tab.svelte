<script lang="ts">
	import EntityGrid from '$lib/components/shared/entity-grid.svelte';
	import CreateArtistCard from '$lib/components/features/create-artist-card.svelte';
	import { editableArtistSchema, type EditableArtist } from '$lib/schema';
	import type { Artist } from '$lib/wails';
	import type { TabViewData } from '$lib/view-models/tab-data';

	type ArtistElement = TabViewData['artists'][number] extends infer T
		? T extends Artist
			? T
			: Artist
		: Artist;

	let creatingArtist = $state(false);
	let currentArtist = $state<EditableArtist | null>(null);

	let {
		artists,
		defaultThumbnail
	}: {
		artists: TabViewData['artists'];
		defaultThumbnail: string;
	} = $props();

	async function onDelete(id: number) {
		void id;
	}

	function convertToEditableArtist(artist: Artist): EditableArtist {
		// zod parse will validate and extract only known fields
		return editableArtistSchema.parse(artist);
	}

	function onClickEdit(artist: Artist) {
		currentArtist = convertToEditableArtist(artist);
		creatingArtist = true;
	}

	function resolveArtistImage(artist: ArtistElement): string {
		if ('image' in artist && typeof artist.image === 'string') {
			return artist.image || defaultThumbnail;
		}
		return defaultThumbnail;
	}
</script>

<EntityGrid
	data={artists}
	entityType="artist"
	showImages={true}
	{defaultThumbnail}
	createCardComponent={CreateArtistCard}
	resolveImage={resolveArtistImage}
	onEdit={onClickEdit}
	{onDelete}
/>
