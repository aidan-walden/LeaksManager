<script lang="ts">
	import DataTable from '$lib/components/ui/data-table/data-table.svelte';
	import { columns } from './columns';
	import FileDropZone from '$lib/components/ui/file-drop-zone/file-drop-zone.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import CreateAlbumCard from '$lib/components/ui/create-album-card.svelte';
	import CreateArtistCard from '$lib/components/ui/create-artist-card.svelte';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio/index.js';
	import { invalidateAll } from '$app/navigation';
	import { setArtistsContext } from '$lib/contexts/artists-context';
	import ArtistMappingDialog from '$lib/components/artist-mapping-dialog.svelte';
	import ArtworkChoiceDialog from '$lib/components/artwork-choice-dialog.svelte';
	import { parse as devalueParse } from 'devalue';

	let { tab, data }: { tab: string; data: any } = $props();

	// Provide artists context for child components
	setArtistsContext(data.artists);

	$inspect(tab, 'tab in InnerView');
	console.log(data);

	// Dialog state
	let showArtistMappingDialog = $state(false);
	let showArtworkChoiceDialog = $state(false);
	let pendingUploadData: any = $state(null);
	let unmappedArtistsList = $state<string[]>([]);
	let filesWithArtworkCount = $state(0);

	async function handleUpload(files: File[]) {
		// Handle the uploaded files
		console.log('Uploaded files:', files);
	}

	async function handleUploadToAlbum(files: File[], albumId: number) {
		try {
			// Step 1: Upload files and extract metadata
			const formData = new FormData();
			for (const file of files) {
				formData.append('files', file);
			}
			formData.append('albumId', albumId.toString());

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
			console.log('Upload result:', uploadResult);

			// Check if it's a SvelteKit ActionResult with type 'failure'
			if (uploadResult.type === 'failure') {
				console.error('Upload failed:', uploadResult.data?.error);
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
			console.log('Parsed data:', data);

			// Store the data for later use
			pendingUploadData = {
				filesData: data.filesData,
				albumId
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
			console.error('Error uploading to album:', error);
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
			pendingUploadData.useEmbeddedArtwork !== undefined
				? pendingUploadData.useEmbeddedArtwork
				: false
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
				pendingUploadData.useEmbeddedArtwork !== undefined
					? pendingUploadData.useEmbeddedArtwork
					: false
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
			console.log('[createSongs] Starting with pendingUploadData:', {
				hasPendingData: !!pendingUploadData,
				hasFilesData: !!pendingUploadData?.filesData,
				filesDataType: typeof pendingUploadData?.filesData,
				filesDataIsArray: Array.isArray(pendingUploadData?.filesData)
			});

			// Convert to FormData with JSON strings
			const formData = new FormData();
			formData.append('filesData', JSON.stringify(pendingUploadData.filesData));
			formData.append('artistMapping', JSON.stringify(artistMapping));
			formData.append('albumId', pendingUploadData.albumId.toString());
			formData.append('useEmbeddedArtwork', useEmbeddedArtwork.toString());

			console.log('[createSongs] Sending data:', {
				filesDataCount: pendingUploadData.filesData?.length,
				artistMapping,
				albumId: pendingUploadData.albumId,
				useEmbeddedArtwork
			});

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
			console.log('Create result raw:', createResult);
			console.log('Create result type:', createResult.type);
			console.log('Create result data:', createResult.data);

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
			alert(
				`An error occurred while creating songs: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	let creatingAlbum = $state(false);
	let creatingArtist = $state(false);

	const defaultThumbnail = '/images/default-album.png';
</script>

{#snippet table()}
	<DataTable data={data.songs} {columns} />
{/snippet}

{#if tab === 'songs'}
	<FileDropZone onUpload={handleUpload} children={table} class="contents" clickable={false} />
{:else if tab === 'albums'}
	<div class="items-left flex flex-row gap-4">
		<Button onclick={() => (creatingAlbum = true)}>+</Button>
	</div>

	<CreateAlbumCard bind:open={creatingAlbum} onOpenChange={(value) => (creatingAlbum = value)} />

	<div class="mt-4 flex flex-row flex-wrap gap-4">
		{#each data.albums as album}
			<div class="mb-4 w-[256px] rounded border p-4">
				<FileDropZone
					onUpload={(files) => handleUploadToAlbum(files, album.id)}
					class="contents"
					clickable={false}
					accept="audio/*"
				>
					<AspectRatio ratio={1 / 1} class="bg-muted">
						<img
							src={album.artworkPath || defaultThumbnail}
							alt={album.name}
							class="rounded-md object-cover"
						/>
					</AspectRatio>
					<p class="mt-2 block text-sm font-medium">{album.name}</p>
				</FileDropZone>
			</div>
		{/each}
	</div>
{:else if tab === 'artists'}
	<div class="items-left flex flex-row gap-4">
		<Button onclick={() => (creatingArtist = true)}>+</Button>
	</div>

	<CreateArtistCard bind:open={creatingArtist} onOpenChange={(value) => (creatingArtist = value)} />

	<div class="mt-4 flex flex-row flex-wrap gap-4">
		{#each data.artists as artist}
			<div class="mb-4 w-[256px] rounded border p-4">
				<AspectRatio ratio={1 / 1} class="bg-muted">
					<img
						src={artist.image || defaultThumbnail}
						alt={artist.name}
						class="rounded-md object-cover"
					/>
				</AspectRatio>
				<p class="mt-2 block text-sm font-medium">{artist.name}</p>
			</div>
		{/each}
	</div>
{/if}

<!-- Artist Mapping Dialog -->
<ArtistMappingDialog
	bind:open={showArtistMappingDialog}
	unmappedArtists={unmappedArtistsList}
	existingArtists={data.artists}
	onResolve={handleArtistMapping}
	onCancel={handleArtistMappingCancel}
/>

<!-- Artwork Choice Dialog -->
<ArtworkChoiceDialog
	bind:open={showArtworkChoiceDialog}
	filesWithArtwork={filesWithArtworkCount}
	onChoice={handleArtworkChoice}
/>
