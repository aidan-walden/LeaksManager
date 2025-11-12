<script lang="ts">
	import SongsTab from './inner-view/songs-tab.svelte';
	import AlbumsTab from './inner-view/albums-tab.svelte';
	import ArtistsTab from './inner-view/artists-tab.svelte';
	import ProducersTab from './inner-view/producers-tab.svelte';
	import { invalidateAll } from '$app/navigation';
	import { setArtistsContext } from '$lib/contexts/artists-context';
	import { setAlbumsContext } from '$lib/contexts/albums-context';
	import { setProducersContext } from '$lib/contexts/producers-context';
	import ArtistMappingDialog from '$lib/components/artist-mapping-dialog.svelte';
	import ArtworkChoiceDialog from '$lib/components/artwork-choice-dialog.svelte';
	import { parse as devalueParse } from 'devalue';
	import type { Artist } from '$lib/server/db/schema';
	import type { PageData } from '../../routes/[tab]/$types';

type ArtistsPromise = PageData['artists'];
type RawArtists = Awaited<ArtistsPromise>;
type ArtistElement = RawArtists extends Array<infer T> ? (T extends Artist ? T : Artist) : Artist;
type ArtistForContext = ArtistElement & { image?: string | null };

type AlbumsPromise = PageData['albums'];
type RawAlbums = Awaited<AlbumsPromise>;
type AlbumElement = RawAlbums extends Array<infer T> ? T : never;

type ProducersPromise = PageData['producers'];
type RawProducers = Awaited<ProducersPromise>;
type ProducerElement = RawProducers extends Array<infer T> ? T : never;

let { tab, data }: { tab: string; data: PageData } = $props();

// Initialize artists state and set context synchronously
let resolvedArtists = $state<ArtistForContext[]>([]);
let resolvedAlbums = $state<AlbumElement[]>([]);
let resolvedProducers = $state<ProducerElement[]>([]);

// Set context with a getter function to maintain reactivity
// Context must be set during component initialization
setArtistsContext<ArtistForContext>(() => resolvedArtists);
setAlbumsContext<AlbumElement>(() => resolvedAlbums);
setProducersContext<ProducerElement>(() => resolvedProducers);

const defaultThumbnail = '/images/default-album.png';

// Update the reactive state when the promise resolves
$effect(() => {
	data.artists.then((artists) => {
		resolvedArtists = artists;
	});
});

$effect(() => {
	data.albums.then((albums) => {
		resolvedAlbums = albums;
	});
});

$effect(() => {
	data.producers.then((producers) => {
		resolvedProducers = producers;
	});
});

$inspect(tab, 'tab in InnerView');

// Dialog state
let showArtistMappingDialog = $state(false);
let showArtworkChoiceDialog = $state(false);
let pendingUploadData: any = $state(null);
let unmappedArtistsList = $state<string[]>([]);
let filesWithArtworkCount = $state(0);

async function handleUpload(files: File[], albumId?: number) {
	try {
		// Step 1: Upload files and extract metadata
		const formData = new FormData();
		for (const file of files) {
			formData.append('files', file);
		}
		if (albumId) {
			formData.append('albumId', albumId.toString());
		}

		const uploadResponse = await fetch('?/uploadAndExtractMetadata', {
			method: 'POST',
			body: formData
		});

		if (!uploadResponse.ok) {
			console.error('Upload response not OK:', uploadResponse.status, uploadResponse.statusText);
			const text = await uploadResponse.text();
			console.error('Response body:', text);
			alert(`Upload failed: ${uploadResponse.statusText}`);
			return;
		}

		const uploadResult = await uploadResponse.json();

		// Check if it's a SvelteKit ActionResult with type 'failure'
		if (uploadResult.type === 'failure') {
			alert(`Upload failed: ${uploadResult.data?.error || 'Unknown error'}`);
			return;
		}

		// Extract data from SvelteKit action result
		// SvelteKit serializes the data using devalue, so we need to parse it with devalue
		let data = uploadResult.type === 'success' ? uploadResult.data : uploadResult;
		if (typeof data === 'string') {
			console.log('Parsing data string with devalue:', data.substring(0, 100));
			data = devalueParse(data);
		}

		// Store the data for later use
		pendingUploadData = {
			filesData: data.filesData,
			albumId: albumId
		};

		// Store unmapped artists list if any
		if (data.unmappedArtists && data.unmappedArtists.length > 0) {
			unmappedArtistsList = data.unmappedArtists;
		} else {
			unmappedArtistsList = [];
		}

		// Step 2: Check if any files have embedded artwork
		if (data.filesWithArtwork > 0) {
			filesWithArtworkCount = data.filesWithArtwork;
			showArtworkChoiceDialog = true;
			return; // Wait for user choice
		}

		// Step 3: Check if any artists need mapping
		if (unmappedArtistsList.length > 0) {
			pendingUploadData.useEmbeddedArtwork = false; // No artwork dialog shown, default to false
			showArtistMappingDialog = true;
			return; // Wait for user mapping
		}

		// No dialogs needed, proceed directly
		await createSongs({}, false);
	} catch (error) {
		console.error('Error uploading:', error);
		alert('An error occurred while uploading files');
	}
}

async function handleArtworkChoice(useEmbedded: boolean) {
	if (!pendingUploadData) return;

	pendingUploadData.useEmbeddedArtwork = useEmbedded;

	// Check if we need to show artist mapping dialog
	if (unmappedArtistsList.length > 0) {
		showArtistMappingDialog = true;
		return;
	}

	// No artist mapping needed, proceed
	await createSongs({}, useEmbedded);
}

async function handleArtistMapping(mapping: Record<string, number | 'CREATE_NEW'>) {
	if (!pendingUploadData) return;

	await createSongs(
		mapping,
		pendingUploadData.useEmbeddedArtwork !== undefined ? pendingUploadData.useEmbeddedArtwork : false
	);
}

async function handleArtistMappingCancel() {
	if (!pendingUploadData) return;

	// Filter out files that have unmapped artists
	const filesToKeep = pendingUploadData.filesData.filter((f: any) => !f.hasUnmappedArtists);
	const filesToDelete = pendingUploadData.filesData.filter((f: any) => f.hasUnmappedArtists);

	// Cleanup files that won't be uploaded
	if (filesToDelete.length > 0) {
		const filepaths = filesToDelete.map((f: any) => f.filepath);
		const cleanupFormData = new FormData();
		cleanupFormData.append('filepaths', JSON.stringify(filepaths));

		await fetch('?/cleanupFiles', {
			method: 'POST',
			body: cleanupFormData
		});
	}

	// If there are files to keep, create songs for those
	if (filesToKeep.length > 0) {
		pendingUploadData.filesData = filesToKeep;
		await createSongs(
			{},
			pendingUploadData.useEmbeddedArtwork !== undefined ? pendingUploadData.useEmbeddedArtwork : false
		);
	} else {
		// All files were skipped
		pendingUploadData = null;
		await invalidateAll();
	}
}

async function createSongs(
	artistMapping: Record<string, number | 'CREATE_NEW'>,
	useEmbeddedArtwork: boolean
) {
	if (!pendingUploadData) return;

	try {
		// Convert to FormData with JSON strings
		const formData = new FormData();
		formData.append('filesData', JSON.stringify(pendingUploadData.filesData));
		formData.append('artistMapping', JSON.stringify(artistMapping));
		if (pendingUploadData.albumId) {
			formData.append('albumId', pendingUploadData.albumId.toString());
		}
		formData.append('useEmbeddedArtwork', useEmbeddedArtwork.toString());

		const createResponse = await fetch('?/createSongsWithMetadata', {
			method: 'POST',
			body: formData
		});

		if (!createResponse.ok) {
			console.error('Create response not OK:', createResponse.status, createResponse.statusText);
			const text = await createResponse.text();
			console.error('Response body:', text);
			alert(`Failed to create songs: ${createResponse.statusText}`);
			return;
		}

		const createResult = await createResponse.json();

		// Parse data if it's a string (using devalue)
		let parsedData = createResult.data;
		if (typeof parsedData === 'string') {
			console.log('Parsing create result data string with devalue');
			parsedData = devalueParse(parsedData);
		}

		// Check if it's a SvelteKit ActionResult with type 'failure'
		if (createResult.type === 'failure') {
			const errorMsg = parsedData?.error || parsedData?.[1] || 'Unknown error';
			console.error('Song creation failed:', errorMsg);
			alert(`Failed to create songs: ${errorMsg}`);
			return;
		}

		// Extract data from SvelteKit action result
		let resultData = createResult.type === 'success' ? parsedData : createResult;

		console.log('Result data extracted:', resultData);
		console.log('Result data songs:', resultData?.songs);
		console.log('Successfully created songs:', resultData?.songs);

		// Clear pending data
		pendingUploadData = null;
		unmappedArtistsList = [];
		filesWithArtworkCount = 0;

		// Refresh the UI
		await invalidateAll();
	} catch (error) {
		console.error('Error creating songs:', error);
		if (error instanceof Error) {
			console.error('Error message:', error.message);
			console.error('Error stack:', error.stack);
		}
		alert(`An error occurred while creating songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

</script>

{#if tab === 'songs'}
	<SongsTab
		songsPromise={data.songs}
		songsPerPage={data.limits.songsPerPage}
		songsCount={data.songsCount}
		onUpload={(files) => handleUpload(files)}
	/>
{:else if tab === 'albums'}
	<AlbumsTab
		albumsPromise={data.albums}
		albumsPerPage={data.limits.albumsPerPage}
		defaultThumbnail={defaultThumbnail}
		onUpload={(files, albumId) => handleUpload(files, albumId)}
	/>
{:else if tab === 'artists'}
	<ArtistsTab artistsPromise={data.artists} defaultThumbnail={defaultThumbnail} />
{:else if tab === 'producers'}
	<ProducersTab producersPromise={data.producers} artistsPromise={data.artists} />
{/if}

<!-- Artist Mapping Dialog -->
<ArtistMappingDialog
	bind:open={showArtistMappingDialog}
	unmappedArtists={unmappedArtistsList}
	existingArtists={resolvedArtists}
	onResolve={handleArtistMapping}
	onCancel={handleArtistMappingCancel}
/>

<!-- Artwork Choice Dialog -->
<ArtworkChoiceDialog
	bind:open={showArtworkChoiceDialog}
	filesWithArtwork={filesWithArtworkCount}
	onChoice={handleArtworkChoice}
/>
