<script lang="ts">
	import EntityGrid from '$lib/components/shared/entity-grid.svelte';
	import CreateArtistCard from '$lib/components/features/create-artist-card.svelte';
	import type { Artist } from '$lib/ipc';

	let {
		artists,
		defaultThumbnail
	}: {
		artists: Artist[];
		defaultThumbnail: string;
	} = $props();

	// Artist edit and delete are not implemented yet; the menu items do nothing.
	function onDelete() {}
	function onClickEdit() {}
</script>

<EntityGrid
	data={artists}
	entityType="artist"
	{defaultThumbnail}
	createCardComponent={CreateArtistCard}
	resolveImage={(artist) => artist.image || defaultThumbnail}
	onEdit={onClickEdit}
	{onDelete}
/>
