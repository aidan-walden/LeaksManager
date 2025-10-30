import {
	createAlbum,
	createArtist,
	createProducer,
	createProducerWithAliases,
	createSong,
	deleteSong,
	deleteProducer,
	getAlbumWithArtists,
	updateAlbum,
	updateSong,
	findArtistByNameCaseInsensitive,
	findAlbumByNameCaseInsensitive,
	deleteAlbum,
	setAlbumArtists,
	getSongsFromAlbum,
	getSettings,
	updateProducerWithAliases,
	getSongsByArtist,
	getSongsByProducer
} from '@/server/db/helpers';
import { fail } from '@sveltejs/kit';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { MICROSERVICE_URL } from '$env/static/private';
import { parseArtists } from '$lib/utils/artist-parser';
import { matchProducersFromFilename } from '$lib/utils/producer-matcher';
import {
	createAlbumSchema,
	createArtistSchema,
	createProducerSchema,
	createSongsWithMetadataSchema,
	deleteRecordByIdSchema,
	updateProducerSchema,
	updateAlbumSchema,
	updateSongSchema,
	uploadAndExtractMetadataSchema,
	uploadArtSchema,
	uploadSongsSchema,
	type FileData
} from '@/schema';

async function uploadAlbumArt(albumId: number, file: File) {
	// Placeholder function to simulate file upload
	console.log(`Uploading album art for album ID: ${albumId}`);
	// Implement actual upload logic here

	const filename = `${Date.now()}-${file.name}`;
	const filepath = join('static', 'uploads', 'artwork', filename);

	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(filepath, buffer);
	await updateAlbum(albumId, { artworkPath: `/uploads/artwork/${filename}` });
}

async function uploadArtistArt(artistId: number, file: File) {
	// Placeholder function to simulate file upload
	console.log(`Uploading artist art for artist ID: ${artistId}`);
	// Implement actual upload logic here
}

async function writeMetadataToDisk(songId: number) {
	const url = new URL(`${MICROSERVICE_URL}/write-metadata/${songId}`);
	const response = await fetch(url);

	if (!response.ok) {
		return fail(response.status, { error: 'Failed to write metadata' });
	}

	const data = await response.json();
	return data;
}

function parseAliasesFromFormData(formData: FormData) {
	const aliases: Array<{ name: string; artistIds: number[] }> = [];
	let index = 0;

	while (formData.has(`aliases[${index}].name`)) {
		const aliasName = formData.get(`aliases[${index}].name`) as string;
		const artistIdsStr = formData.get(`aliases[${index}].artistIds`) as string;

		if (aliasName && aliasName.trim().length > 0) {
			const artistIds =
				artistIdsStr && artistIdsStr.trim().length > 0
					? artistIdsStr
							.split(',')
							.map((id) => parseInt(id.trim(), 10))
							.filter((id) => !isNaN(id))
					: [];

			aliases.push({
				name: aliasName.trim(),
				artistIds
			});
		}

		index++;
	}

	return aliases;
}

export const actions = {
	createAlbum: async ({ request }) => {
		const formData = await request.formData();
		const title = formData.get('name') as string | null;
		const artistIdsStr = formData.get('artistIds') as string | null;
		const year = formData.get('year') as string | null;
		const genre = formData.get('genre') as string | null;

		const validated = createAlbumSchema.safeParse({
			name: title,
			artistIds: artistIdsStr,
			year: year,
			genre: genre
		});

		if (!validated.success) {
			return fail(400, { error: 'Invalid form data' });
		}

		console.log('Creating album with data:', {
			name: validated.data.name,
			artistIds: validated.data.artistIds,
			year: validated.data.year
		});

		try {
			const dbAlbum = await createAlbum({
				name: validated.data.name,
				artistIds: validated.data.artistIds,
				year: validated.data.year ? validated.data.year : undefined,
				genre: validated.data.genre ? validated.data.genre : undefined
			});
			console.log('Album created successfully');
			return { success: true, id: dbAlbum.id, message: 'Album created successfully' };
		} catch (error) {
			console.error('Error creating album:', error);
			return fail(500, { error: 'Failed to create album' });
		}
	},

	createArtist: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name') as string | null;
		const careerStart = formData.get('career-start') as string | null;
		const careerEnd = formData.get('career-end') as string | null;

		const validated = createArtistSchema.safeParse({
			name,
			careerStart,
			careerEnd
		});

		if (!validated.success) {
			return fail(400, { error: 'Invalid form data' });
		}

		console.log('Creating artist with data:', {
			name: validated.data.name,
			careerStart: validated.data.careerStart,
			careerEnd: validated.data.careerEnd
		});

		try {
			const dbArtist = await createArtist({
				name: validated.data.name,
				careerStartYear: validated.data.careerStart
					? parseInt(validated.data.careerStart)
					: undefined,
				careerEndYear: validated.data.careerEnd ? parseInt(validated.data.careerEnd) : undefined
			});
			console.log('Artist created successfully');
			return { success: true, id: dbArtist.id, message: 'Artist created successfully' };
		} catch (error) {
			console.error('Error creating artist:', error);
			return fail(500, { error: 'Failed to create artist' });
		}
	},

	createProducer: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name') as string | null;

		const aliases = parseAliasesFromFormData(formData);

		const validated = createProducerSchema.safeParse({
			name,
			aliases
		});

		if (!validated.success) {
			console.error('Validation failed:', validated.error);
			return fail(400, { error: 'Invalid form data' });
		}

		console.log('Creating producer with data:', {
			name: validated.data.name,
			aliases: validated.data.aliases
		});

		try {
			const dbProducer = await createProducerWithAliases({
				name: validated.data.name,
				aliases: validated.data.aliases
			});
			console.log('Producer created successfully with aliases');
			return { success: true, id: dbProducer.id, message: 'Producer created successfully' };
		} catch (error) {
			console.error('Error creating producer:', error);
			// Check if it's an alias uniqueness error
			if (error instanceof Error && error.message.includes('already exists')) {
				return fail(400, { error: error.message });
			}
			return fail(500, { error: 'Failed to create producer' });
		}
	},

	updateProducer: async ({ request }) => {
		const formData = await request.formData();
		const idStr = formData.get('id') as string | null;
		const name = formData.get('name') as string | null;

		const aliases = parseAliasesFromFormData(formData);

		const validated = updateProducerSchema.safeParse({
			id: idStr,
			name,
			aliases
		});

		if (!validated.success) {
			console.error('Validation failed:', validated.error);
			return fail(400, { error: 'Invalid form data' });
		}

		console.log('Updating producer with data:', {
			id: validated.data.id,
			name: validated.data.name,
			aliases: validated.data.aliases
		});

		try {
			const dbProducer = await updateProducerWithAliases({
				id: validated.data.id,
				name: validated.data.name,
				aliases: validated.data.aliases
			});
			console.log('Producer updated successfully');

			const songs = await getSongsByProducer(validated.data.id);

			const songIds = songs.map((song) => song.songId);

			return {
				success: true,
				id: dbProducer?.id,
				message: 'Producer updated successfully'
			};
		} catch (error) {
			console.error('Error updating producer:', error);
			if (error instanceof Error && error.message.includes('already exists')) {
				return fail(400, { error: error.message });
			}
			return fail(500, { error: 'Failed to update producer' });
		}
	},

	deleteProducer: async ({ request }) => {
		const formData = await request.formData();
		const idStr = formData.get('id') as string | null;

		const validated = deleteRecordByIdSchema.safeParse({
			id: idStr
		});

		if (!validated.success) {
			return fail(400, { error: 'Invalid form data' });
		}

		try {
			console.log(`Deleting producer with ID: ${validated.data.id}`);
			await deleteProducer(validated.data.id);

			return { success: true, message: 'Producer deleted successfully' };
		} catch (error) {
			console.error('Error deleting producer:', error);
			return fail(500, { error: 'Failed to delete producer' });
		}
	},

	uploadArt: async ({ request }) => {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const type = formData.get('type') as string | null;
		const id = formData.get('id') as string | null;

		const validated = uploadArtSchema.safeParse({
			file,
			type,
			id
		});

		if (!validated.success) {
			return fail(400, { error: 'Invalid form data' });
		}

		try {
			if (validated.data.type === 'album') {
				await uploadAlbumArt(validated.data.id, validated.data.file);
			} else {
				await uploadArtistArt(validated.data.id, validated.data.file);
			}
			return { success: true };
		} catch (error) {
			console.error('Error uploading art:', error);
			return fail(500, { error: 'Failed to upload art' });
		}
	},

	uploadSongs: async ({ request }) => {
		// Load settings to check if track numbers should be cleared
		const settings = await getSettings();

		const formData = await request.formData();
		const files = formData.getAll('files') as File[];
		const albumId = formData.get('albumId') as string | null;

		const validated = uploadSongsSchema.safeParse({
			files: files,
			albumId: albumId
		});

		if (!validated.success) {
			console.error('Upload songs validation error:', validated.error);
			return fail(400, { error: 'Invalid form data' });
		}

		let album;

		if (validated.data.albumId) {
			// Verify album exists and fetch with artists
			album = await getAlbumWithArtists(validated.data.albumId);
		}

		let artworkPath: string | undefined = undefined;
		let artistIds: number[] | undefined = undefined;

		if (album) {
			if (album.artworkPath) {
				artworkPath = album.artworkPath;
			}
			// Extract artist IDs from the album, maintaining order
			if (album.albumArtists && album.albumArtists.length > 0) {
				artistIds = album.albumArtists.map((aa) => aa.artistId);
			}
		}

		for (const file of validated.data.files) {
			const filename = `${Date.now()}-${file.name}`;
			const filepath = join('static', 'uploads', 'songs', filename);

			const buffer = Buffer.from(await file.arrayBuffer());
			await writeFile(filepath, buffer);

			// Always extract all metadata from the file
			let metadata: any = {};
			try {
				const dbFilepath = `/uploads/songs/${filename}`;
				const extractResponse = await fetch(`${MICROSERVICE_URL}/extract-metadata`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ filepath: dbFilepath })
				});

				if (extractResponse.ok) {
					metadata = await extractResponse.json();
				}
			} catch (error) {
				console.error('Error extracting metadata:', error);
				// Continue without metadata
			}

			// Conditionally clear track number based on setting
			const trackNumber = settings.clearTrackNumberOnUpload
				? undefined
				: (metadata.trackNumber ?? undefined);

			const song = await createSong({
				name: metadata.title || file.name,
				filepath: `/uploads/songs/${filename}`,
				albumId: validated.data.albumId ? validated.data.albumId : undefined,
				artworkPath: artworkPath,
				artistIds: artistIds,
				genre: metadata.genre ?? undefined,
				year: metadata.year ?? undefined,
				trackNumber: trackNumber,
				duration: metadata.duration ?? undefined
			});
			await writeMetadataToDisk(song.id);
		}
	},

	updateSong: async ({ request }) => {
		// Implement song update logic here
		const formData = await request.formData();
		const name = formData.get('name') as string | null;
		const artistIdsStr = formData.get('artistIds') as string | null;
		const producerIdsStr = formData.get('producerIds') as string | null;
		const album = formData.get('album') as string | null;
		const albumId = formData.get('albumId') as string | null;
		const trackNumber = formData.get('trackNumber') as string | null;
		const songId = formData.get('songId') as string | null;

		const validated = updateSongSchema.safeParse({
			name,
			artistIds: artistIdsStr,
			producerIds: producerIdsStr,
			album,
			albumId,
			trackNumber,
			songId
		});

		if (!validated.success) {
			console.error('Validation error:', validated.error);
			return fail(400, { error: 'Invalid form data' });
		}

		console.log('Updating song with data:', {
			name: validated.data.name,
			artistIds: validated.data.artistIds,
			producerIds: validated.data.producerIds,
			album: validated.data.album,
			albumId: validated.data.albumId,
			trackNumber: validated.data.trackNumber,
			songId: validated.data.songId
		});

		try {
			await updateSong(validated.data.songId, {
				name: validated.data.name,
				artistIds: validated.data.artistIds,
				producerIds: validated.data.producerIds,
				albumId: validated.data.albumId,
				trackNumber: validated.data.trackNumber
			});

			await writeMetadataToDisk(validated.data.songId);

			console.log('Song updated successfully');
			return { success: true, message: 'Song updated successfully' };
		} catch (error) {
			console.error('Error updating song:', error);
			return fail(500, { error: 'Failed to update song' });
		}
	},

	deleteSong: async ({ request }) => {
		const formData = await request.formData();
		const idStr = formData.get('id') as string | null;

		const validated = deleteRecordByIdSchema.safeParse({
			id: idStr
		});

		if (!validated.success) {
			return fail(400, { error: 'Invalid form data' });
		}

		try {
			console.log(`Deleting song with ID: ${validated.data.id}`);
			const song = await deleteSong(validated.data.id);
			if (song && song[0]) {
				await unlink(join('static', song[0].filepath));
			}

			return { success: true, message: 'Song deleted successfully' };
		} catch (error) {
			console.error('Error deleting song:', error);
			return fail(500, { error: 'Failed to delete song' });
		}
	},

	deleteAlbum: async ({ request }) => {
		const formData = await request.formData();
		const idStr = formData.get('id') as string | null;

		const validated = deleteRecordByIdSchema.safeParse({
			id: idStr
		});

		if (!validated.success) {
			return fail(400, { error: 'Invalid form data' });
		}

		try {
			console.log(`Deleting album with ID: ${validated.data.id}`);
			await deleteAlbum(validated.data.id);

			return { success: true, message: 'Album deleted successfully' };
		} catch (error) {
			console.error('Error deleting album:', error);
			return fail(500, { error: 'Failed to delete album' });
		}
	},

	uploadAndExtractMetadata: async ({ request }) => {
		const formData = await request.formData();
		const files = formData.getAll('files') as File[];
		const albumId = formData.get('albumId') as string | null;

		const validated = uploadAndExtractMetadataSchema.safeParse({
			files: files,
			albumId: albumId
		});

		if (!validated.success) {
			return fail(400, { error: 'Invalid form data' });
		}

		if (files.length === 0) {
			return fail(400, { error: 'Files are required' });
		}

		try {
			const filesData: FileData[] = [];
			const allArtistNames = new Set<string>();
			const allAlbumNames = new Set<string>();
			let filesWithArtwork = 0;

			// Step 1: Save files and extract metadata
			for (const file of validated.data.files) {
				const filename = `${Date.now()}-${file.name}`;
				const filepath = join('static', 'uploads', 'songs', filename);

				// Save file to disk
				const buffer = Buffer.from(await file.arrayBuffer());
				await writeFile(filepath, buffer);
				console.log(`[uploadAndExtractMetadata] Saved file to: ${filepath}`);

				// Extract metadata from file via microservice
				const dbFilepath = `/uploads/songs/${filename}`;

				const extractResponse = await fetch(`${MICROSERVICE_URL}/extract-metadata`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ filepath: dbFilepath })
				});

				if (!extractResponse.ok) {
					const errorText = await extractResponse.text();
					console.error(
						`Failed to extract metadata for ${file.name}:`,
						extractResponse.status,
						errorText
					);
					// Continue with empty metadata
				}

				const metadata = extractResponse.ok ? await extractResponse.json() : {};

				// Parse artists from metadata
				const parsedArtists = parseArtists(metadata.artist);
				parsedArtists.forEach((artist) => allArtistNames.add(artist));

				if (!validated.data.albumId) {
					allAlbumNames.add(metadata.album || 'Unknown Album');
				}

				// Check if has artwork
				if (metadata.artwork) {
					filesWithArtwork++;
				}

				const fileDataEntry = {
					originalFilename: file.name,
					filepath: dbFilepath,
					metadata,
					parsedArtists,
					hasUnmappedArtists: false // Will be updated later
				};

				filesData.push(fileDataEntry);
			}

			// Step 2: Check which artists exist in DB (case-insensitive)
			const artistNames = Array.from(allArtistNames);
			const existingArtistsMap = new Map<string, number>(); // lowercase name → artist ID

			for (const artistName of artistNames) {
				const existingArtist = await findArtistByNameCaseInsensitive(artistName);
				if (existingArtist) {
					existingArtistsMap.set(artistName.toLowerCase(), existingArtist.id);
				}
			}

			// Step 3: Identify unmapped artists
			const unmappedArtists = artistNames.filter(
				(name) => !existingArtistsMap.has(name.toLowerCase())
			);

			// Step 4: Mark files that have unmapped artists
			for (const fileData of filesData) {
				fileData.hasUnmappedArtists =
					fileData.parsedArtists !== undefined &&
					fileData.parsedArtists.some((artist) => !existingArtistsMap.has(artist.toLowerCase()));
			}

			// Step 5: Check if we need to map albums
			if (!validated.data.albumId) {
				// Find album with the same name in DB
				const albumNames = Array.from(allAlbumNames);
				const existingAlbumsMap = new Map<string, number>(); // lowercase name → album ID

				for (const albumName of albumNames) {
					const existingAlbum = await findAlbumByNameCaseInsensitive(albumName);
					if (existingAlbum) {
						existingAlbumsMap.set(albumName.toLowerCase(), existingAlbum.id);
					}
				}

				// Step 6: Map files to albums
				for (const fileData of filesData) {
					const albumName = fileData.metadata.album?.trim();
					if (!albumName) {
						continue;
					}
					const existingAlbum = existingAlbumsMap.get(albumName.toLowerCase());
					if (existingAlbum) {
						fileData.albumId = existingAlbum;
					}
				}
			}

			return {
				filesData,
				unmappedArtists,
				filesWithArtwork
			};
		} catch (error) {
			console.error('Error uploading and extracting metadata:', error);
			return fail(500, { error: 'Failed to upload and extract metadata' });
		}
	},

	createSongsWithMetadata: async ({ request }) => {
		try {
			// Load settings to check if track numbers should be cleared
			const settings = await getSettings();

			const formData = await request.formData();
			const filesDataStr = formData.get('filesData') as string | null;
			const artistMappingStr = formData.get('artistMapping') as string | null;
			const albumId = formData.get('albumId') as string | null;
			const useEmbeddedArtworkStr = formData.get('useEmbeddedArtwork') as string | null;

			console.log(`Album id is ${albumId}`);

			const validated = createSongsWithMetadataSchema.safeParse({
				filesData: filesDataStr,
				artistMapping: artistMappingStr,
				albumId: albumId,
				useEmbeddedArtwork: useEmbeddedArtworkStr
			});

			if (!validated.success) {
				console.log(validated.error);
				return fail(400, { error: 'Invalid form data' });
			}

			const artistMapping = validated.data.artistMapping;

			console.log('[createSongsWithMetadata] Parsed artistMapping:', artistMapping);

			// Step 1: Create new artists for those marked 'CREATE_NEW'
			const artistIdMap = new Map<string, number>(); // artist name (original case) → artist ID

			for (const [artistName, resolution] of Object.entries(artistMapping || {})) {
				if (resolution === 'CREATE_NEW') {
					// Create new artist
					const newArtist = await createArtist({ name: artistName as string });
					artistIdMap.set(artistName as string, newArtist.id);
					console.log(`Created new artist: ${artistName} with ID ${newArtist.id}`);
				} else {
					// Use existing artist ID
					artistIdMap.set(artistName as string, resolution as number);
				}
			}

			// Step 2: Also check for artists that already existed (not in mapping)
			for (const fileData of validated.data.filesData) {
				const parsedArtists = fileData.parsedArtists || [];
				for (const artistName of parsedArtists) {
					if (!artistIdMap.has(artistName)) {
						// This artist already existed, find it
						const existingArtist = await findArtistByNameCaseInsensitive(artistName);
						if (existingArtist) {
							artistIdMap.set(artistName, existingArtist.id);
						}
					}
				}
			}

			// Step 3: Get album data for inheritance
			let album;
			if (validated.data.albumId) {
				album = await getAlbumWithArtists(validated.data.albumId);
				if (!album) {
					return fail(400, { error: 'Album not found' });
				}
			}

			// Step 4: Create songs
			const createdSongs = [];

			for (const fileData of validated.data.filesData) {
				console.log('[createSongsWithMetadata] Processing file:', {
					filename: fileData.originalFilename,
					hasParsedArtists: !!fileData.parsedArtists,
					parsedArtists: fileData.parsedArtists
				});

				// Resolve artist IDs for this song
				const parsedArtists = fileData.parsedArtists || [];
				const songArtistIds = parsedArtists
					.map((artistName: string) => artistIdMap.get(artistName))
					.filter((id: number | undefined): id is number => id !== undefined);

				// Determine which album this file belongs to for inheritance
				const fileAlbumId = fileData.albumId;
				let currentAlbum = album; // Use shared album if uploading to specific album
				if (!currentAlbum && fileAlbumId) {
					currentAlbum = await getAlbumWithArtists(fileAlbumId);
				}

				// Use artists from metadata if available, otherwise inherit from album
				const finalArtistIds =
					songArtistIds.length > 0
						? songArtistIds
						: currentAlbum?.albumArtists?.map((aa) => aa.artistId) || [];

				// Handle artwork
				let artworkPath: string | undefined = undefined;

				if (validated.data.useEmbeddedArtwork && fileData.metadata.artwork) {
					console.log('[createSongsWithMetadata] BRANCH: Using embedded artwork from file');
					// Save embedded artwork to disk
					const artworkData = fileData.metadata.artwork;
					const extension = artworkData.mimeType === 'image/png' ? 'png' : 'jpg';
					const artworkFilename = `${Date.now()}-artwork.${extension}`;
					const artworkFilepath = join('static', 'uploads', 'artwork', artworkFilename);

					// Decode base64 and save
					const artworkBuffer = Buffer.from(artworkData.data, 'base64');
					await writeFile(artworkFilepath, artworkBuffer);

					artworkPath = `/uploads/artwork/${artworkFilename}`;
				} else if (currentAlbum?.artworkPath) {
					console.log('[createSongsWithMetadata] BRANCH: Inheriting artwork from album');
					// Inherit from album
					artworkPath = currentAlbum.artworkPath;
				} else {
					console.log('[createSongsWithMetadata] BRANCH: No artwork to use');
				}

				// Use album ID from form data if available, otherwise use album ID from file data

				const finalAlbumId = validated.data.albumId
					? validated.data.albumId
					: fileData.albumId
						? fileData.albumId
						: undefined;

				console.log('[createSongsWithMetadata] Final album ID:', finalAlbumId);
				console.log('[createSongsWithMetadata] Artwork path for song:', artworkPath);
				console.log('[createSongsWithMetadata] Current album artwork:', currentAlbum?.artworkPath);

				// Match producers from filename based on aliases
				let producerIds: number[] = [];
				try {
					producerIds = await matchProducersFromFilename(fileData.originalFilename, finalArtistIds);
					if (producerIds.length > 0) {
						console.log(
							`[createSongsWithMetadata] Matched ${producerIds.length} producer(s) from filename:`,
							producerIds
						);
					}
				} catch (error) {
					console.error('[createSongsWithMetadata] Error matching producers:', error);
					// Continue without producers if matching fails
				}

				// Create the song
				const song = await createSong({
					name: fileData.metadata.title || fileData.originalFilename,
					filepath: fileData.filepath,
					albumId: finalAlbumId,
					artworkPath,
					artistIds: finalArtistIds,
					producerIds,
					genre: fileData.metadata.genre ?? undefined,
					year: fileData.metadata.year ?? undefined,
					trackNumber: settings.clearTrackNumberOnUpload
						? undefined
						: (fileData.metadata.trackNumber ?? undefined),
					duration: fileData.metadata.duration ?? undefined
				});

				createdSongs.push(song);

				// Step 5: Write metadata back to file
				await writeMetadataToDisk(song.id);
			}

			return {
				message: `Successfully created ${createdSongs.length} song(s)`,
				songs: createdSongs
			};
		} catch (error) {
			console.error('Error creating songs with metadata:', error);
			console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
			return fail(500, {
				error: `Failed to create songs with metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}
	},

	updateAlbum: async ({ request }) => {
		try {
			const formData = await request.formData();
			const name = formData.get('name') as string | null;
			const year = formData.get('year') as string | null;
			const genre = formData.get('genre') as string | null;
			const albumId = formData.get('albumId') as string | null;
			const artistIds = formData.get('artistIds') as string | null;

			const validated = updateAlbumSchema.safeParse({
				id: albumId,
				name: name,
				year: year,
				genre: genre,
				artistIds: artistIds
			});

			if (!validated.success) {
				return fail(400, { error: 'Invalid form data' });
			}

			await updateAlbum(validated.data.id, {
				name: validated.data.name,
				year: validated.data.year,
				genre: validated.data.genre
			});

			await setAlbumArtists(validated.data.id, validated.data.artistIds);

			// Write updated metadata to all songs in this album
			try {
				const response = await fetch(
					`${MICROSERVICE_URL}/write-metadata/album/${validated.data.id}`
				);
				if (!response.ok) {
					console.error('Failed to write metadata to album songs:', await response.text());
					// Don't fail the entire request, just log the error
				} else {
					const result = await response.json();
					console.log(`Wrote metadata to ${result.songs_processed} songs in album`);
				}
			} catch (error) {
				console.error('Error calling microservice to write album metadata:', error);
				// Don't fail the entire request
			}

			return { success: true, message: 'Album updated successfully' };
		} catch (error) {
			console.error('Error updating album:', error);
			return fail(500, { error: 'Failed to update album' });
		}
	},

	cleanupFiles: async ({ request }) => {
		try {
			const formData = await request.formData();
			const filepathsStr = formData.get('filepaths') as string | null;

			if (!filepathsStr) {
				return fail(400, { error: 'Filepaths array is required' });
			}

			const filepaths = JSON.parse(filepathsStr);

			if (!Array.isArray(filepaths)) {
				return fail(400, { error: 'Filepaths must be an array' });
			}

			for (const filepath of filepaths) {
				try {
					// Convert DB filepath to filesystem path
					const fullPath = join('static', filepath);
					await unlink(fullPath);
					console.log(`Deleted file: ${fullPath}`);
				} catch (error) {
					console.error(`Failed to delete file ${filepath}:`, error);
					// Continue with other files
				}
			}

			return { message: `Cleaned up ${filepaths.length} file(s)` };
		} catch (error) {
			console.error('Error cleaning up files:', error);
			return fail(500, { error: 'Failed to cleanup files' });
		}
	}
};
