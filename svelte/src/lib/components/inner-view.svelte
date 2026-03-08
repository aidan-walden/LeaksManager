<script lang="ts">
	import SongsTab from './inner-view/songs-tab.svelte';
	import AlbumsTab from './inner-view/albums-tab.svelte';
	import ArtistsTab from './inner-view/artists-tab.svelte';
	import ProducersTab from './inner-view/producers-tab.svelte';
	import { invalidateAll } from '$app/navigation';
	import { SongImportController } from '$lib/features/song-import/song-import-controller.svelte';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import { setArtistsContext } from '$lib/contexts/artists-context';
	import { setAlbumsContext } from '$lib/contexts/albums-context';
	import { setProducersContext } from '$lib/contexts/producers-context';
	import ArtistMappingDialog from '$lib/components/artist-mapping-dialog.svelte';
	import ArtworkChoiceDialog from '$lib/components/artwork-choice-dialog.svelte';
	import type { TabViewData } from '$lib/view-models/tab-data';

	type ArtistForContext = TabViewData['artists'][number] & { image?: string | null };
	type AlbumElement = TabViewData['albums'][number];
	type ProducerElement = TabViewData['producers'][number];

	let { tab, data }: { tab: string; data: TabViewData } = $props();

	// Initialize artists state and set context synchronously
	let resolvedArtists = $state<ArtistForContext[]>([]);
	let resolvedAlbums = $state<AlbumElement[]>([]);
	let resolvedProducers = $state<ProducerElement[]>([]);

	// Set context with a getter function to maintain reactivity
	// Context must be set during component initialization
	setArtistsContext<ArtistForContext>(() => resolvedArtists);
	setAlbumsContext<AlbumElement>(() => resolvedAlbums);
	setProducersContext<ProducerElement>(() => resolvedProducers);
	const { wailsActions } = getAppServicesContext();

	const defaultThumbnail = '/images/default-album.png';
	const songImport = new SongImportController({
		onComplete: () => invalidateAll(),
		wailsActions
	});

	$effect(() => {
		resolvedArtists = data.artists;
		resolvedAlbums = data.albums;
		resolvedProducers = data.producers;
	});

</script>

{#if tab === 'songs'}
	<SongsTab
		songs={data.songs}
		songsPerPage={data.limits.songsPerPage}
		songsCount={data.songsCount}
		onUpload={(files) => songImport.handleUpload(files)}
	/>
{:else if tab === 'albums'}
	<AlbumsTab
		albums={data.albums}
		albumsPerPage={data.limits.albumsPerPage}
		{defaultThumbnail}
		onUpload={async (files, albumId) => {
			await songImport.handleUpload(files, albumId);
		}}
	/>
{:else if tab === 'artists'}
	<ArtistsTab artists={data.artists} {defaultThumbnail} />
{:else if tab === 'producers'}
	<ProducersTab producers={data.producers} artists={data.artists} />
{/if}

<!-- Artist Mapping Dialog -->
<ArtistMappingDialog
	bind:open={songImport.showArtistMappingDialog}
	unmappedArtists={songImport.unmappedArtists}
	existingArtists={resolvedArtists}
	onResolve={songImport.handleArtistMapping.bind(songImport)}
	onCancel={songImport.handleArtistMappingCancel.bind(songImport)}
/>

<!-- Artwork Choice Dialog -->
<ArtworkChoiceDialog
	bind:open={songImport.showArtworkChoiceDialog}
	filesWithArtwork={songImport.filesWithArtworkCount}
	onChoice={songImport.handleArtworkChoice.bind(songImport)}
/>
