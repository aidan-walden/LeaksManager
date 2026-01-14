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
	import type { PageData } from '../../routes/[tab]/$types';
	import {
		UploadAndExtractMetadata,
		CreateSongsWithMetadata,
		CleanupFiles,
		type FileUpload,
		type FileData,
		type Artist
	} from '$lib/wails';

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

// helper to convert File to FileUpload (base64)
async function fileToUpload(file: File): Promise<FileUpload> {
	const arrayBuffer = await file.arrayBuffer();
	const base64 = btoa(
		new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
	);
	return {
		filename: file.name,
		base64Data: base64
	};
}

async function handleUpload(files: File[], albumId?: number) {
	try {
		// convert files to base64 for Wails
		const fileUploads = await Promise.all(files.map(fileToUpload));

		// call Wails binding to upload and extract metadata
		const result = await UploadAndExtractMetadata(fileUploads, albumId ?? null);

		// store the data for later use
		pendingUploadData = {
			filesData: result.filesData,
			albumId: albumId
		};

		// store unmapped artists list if any
		if (result.unmappedArtists && result.unmappedArtists.length > 0) {
			unmappedArtistsList = result.unmappedArtists;
		} else {
			unmappedArtistsList = [];
		}

		// check if any files have embedded artwork
		if (result.filesWithArtwork > 0) {
			filesWithArtworkCount = result.filesWithArtwork;
			showArtworkChoiceDialog = true;
			return; // wait for user choice
		}

		// check if any artists need mapping
		if (unmappedArtistsList.length > 0) {
			pendingUploadData.useEmbeddedArtwork = false;
			showArtistMappingDialog = true;
			return; // wait for user mapping
		}

		// no dialogs needed, proceed directly
		await createSongs({}, false);
	} catch (error) {
		console.error('Error uploading:', error);
		alert(`An error occurred while uploading files: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

	// filter out files that have unmapped artists
	const filesToKeep = pendingUploadData.filesData.filter((f: FileData) => !f.hasUnmappedArtists);
	const filesToDelete = pendingUploadData.filesData.filter((f: FileData) => f.hasUnmappedArtists);

	// cleanup files that won't be uploaded
	if (filesToDelete.length > 0) {
		const filepaths = filesToDelete.map((f: FileData) => f.filepath);
		await CleanupFiles(filepaths);
	}

	// if there are files to keep, create songs for those
	if (filesToKeep.length > 0) {
		pendingUploadData.filesData = filesToKeep;
		await createSongs(
			{},
			pendingUploadData.useEmbeddedArtwork !== undefined ? pendingUploadData.useEmbeddedArtwork : false
		);
	} else {
		// all files were skipped
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
		// call Wails binding to create songs
		const songs = await CreateSongsWithMetadata({
			filesData: pendingUploadData.filesData,
			artistMapping,
			albumId: pendingUploadData.albumId,
			useEmbeddedArtwork
		});

		console.log('Successfully created songs:', songs);

		// clear pending data
		pendingUploadData = null;
		unmappedArtistsList = [];
		filesWithArtworkCount = 0;

		// refresh the UI
		await invalidateAll();
	} catch (error) {
		console.error('Error creating songs:', error);
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
