import {
	createAlbum,
	createArtist,
	createSong,
	deleteSong,
	getAlbumWithArtists,
	updateAlbum,
	updateSong,
	findArtistByNameCaseInsensitive,
	findAlbumByNameCaseInsensitive
} from '@/server/db/helpers';
import type { PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { MICROSERVICE_URL } from '$env/static/private';
import { parseArtists } from '$lib/utils/artist-parser';
import {
	createAlbumSchema,
	createArtistSchema,
	deleteSongSchema,
	updateSongSchema,
	uploadAndExtractMetadataSchema,
	uploadArtSchema,
	uploadSongsSchema
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

export const load: PageServerLoad = async ({ params, parent }) => {
	const data = await parent(); // Gets data from layout
	const tab = params.tab;

	// Just return the relevant slice
	if (tab === 'songs') return { songs: data.songs };
	if (tab === 'albums') return { albums: data.albums };
	if (tab === 'artists') return { artists: data.artists };

	return {};
};

export const actions = {
	createAlbum: async ({ request }) => {
		const formData = await request.formData();
		const title = formData.get('name') as string;
		const artistIdsStr = formData.get('artistIds') as string;
		const year = formData.get('year') as string;

		const validated = createAlbumSchema.safeParse({
			name: title,
			artistIds: artistIdsStr,
			year: year
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
				year: validated.data.year ? parseInt(validated.data.year) : undefined
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
		const name = formData.get('name') as string;
		const careerStart = formData.get('career-start') as string;
		const careerEnd = formData.get('career-end') as string;

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

	uploadArt: async ({ request }) => {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const type = formData.get('type') as 'album' | 'artist';
		const id = formData.get('id') as string;

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
		const formData = await request.formData();
		const files = formData.getAll('files') as File[];
		const albumId = formData.get('albumId') as string;

		const validated = uploadSongsSchema.safeParse({
			files: files,
			albumId: albumId
		});

		if (!validated.success) {
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
			const song = await createSong({
				name: file.name,
				filepath: `/uploads/songs/${filename}`,
				albumId: validated.data.albumId ? validated.data.albumId : undefined,
				artworkPath: artworkPath,
				artistIds: artistIds
			});
			await writeMetadataToDisk(song.id);
		}
	},

	updateSong: async ({ request }) => {
		// Implement song update logic here
		const formData = await request.formData();
		const name = formData.get('name') as string;
		const artistIdsStr = formData.get('artistIds') as string;
		const album = formData.get('album') as string;
		const songId = formData.get('songId') as string;

		const validated = updateSongSchema.safeParse({
			name,
			artistIdsStr,
			album,
			songId
		});

		if (!validated.success) {
			return fail(400, { error: 'Invalid form data' });
		}

		console.log('Updating song with data:', {
			name: validated.data.name,
			artistIdsStr: validated.data.artistIds,
			album: validated.data.album,
			songId: validated.data.songId
		});

		try {
			await updateSong(validated.data.songId, {
				name,
				artistIds: validated.data.artistIds
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
		const idStr = formData.get('id') as string;

		const validated = deleteSongSchema.safeParse({
			id: idStr
		});

		if (!validated.success) {
			return fail(400, { error: 'Invalid form data' });
		}

		try {
			// Implement song deletion logic here
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

	uploadAndExtractMetadata: async ({ request }) => {
		const formData = await request.formData();
		const files = formData.getAll('files') as File[];
		const uploadToAlbum = formData.get('uploadToAlbum') as string;

		const validated = uploadAndExtractMetadataSchema.safeParse({
			files: files,
			uploadToAlbum: uploadToAlbum
		});

		if (!validated.success) {
			return fail(400, { error: 'Invalid form data' });
		}

		if (files.length === 0) {
			return fail(400, { error: 'Files are required' });
		}

		try {
			interface FileData {
				albumId?: number;
				originalFilename: string;
				filepath: string;
				metadata: {
					title?: string;
					artist?: string;
					album?: string;
					year?: number;
					genre?: string;
					trackNumber?: number;
					producer?: string;
					duration?: number;
					artwork?: {
						data: string;
						mimeType: string;
					};
				};
				parsedArtists: string[];
				hasUnmappedArtists: boolean;
			}

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

				if (!validated.data.uploadToAlbum) {
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
				fileData.hasUnmappedArtists = fileData.parsedArtists.some(
					(artist) => !existingArtistsMap.has(artist.toLowerCase())
				);
			}

			// Step 5: Check if we need to map albums
			if (!validated.data.uploadToAlbum) {
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
			const formData = await request.formData();
			const filesDataStr = formData.get('filesData') as string;
			const artistMappingStr = formData.get('artistMapping') as string;
			const albumId = formData.get('albumId') as string | undefined;
			const useEmbeddedArtworkStr = formData.get('useEmbeddedArtwork') as string;

			console.log('[createSongsWithMetadata] filesDataStr:', filesDataStr ? 'present' : 'missing');
			console.log(
				'[createSongsWithMetadata] artistMappingStr:',
				artistMappingStr ? artistMappingStr : 'missing'
			);
			console.log('[createSongsWithMetadata] albumId:', albumId);
			console.log('[createSongsWithMetadata] useEmbeddedArtworkStr:', useEmbeddedArtworkStr);

			if (!filesDataStr) {
				return fail(400, { error: 'Files data is required' });
			}

			const filesData = JSON.parse(filesDataStr);
			const artistMapping = artistMappingStr ? JSON.parse(artistMappingStr) : {};
			const useEmbeddedArtwork = useEmbeddedArtworkStr === 'true';

			console.log('[createSongsWithMetadata] Parsed artistMapping:', artistMapping);

			if (!Array.isArray(filesData)) {
				return fail(400, { error: 'Files data must be an array' });
			}

			if (filesData.length === 0) {
				return fail(400, { error: 'No files to process' });
			}

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
			for (const fileData of filesData) {
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
			if (albumId) {
				album = await getAlbumWithArtists(parseInt(albumId));
				if (!album) {
					return fail(400, { error: 'Album not found' });
				}
			}

			// Step 4: Create songs
			const createdSongs = [];

			for (const fileData of filesData) {
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

				// Use artists from metadata if available, otherwise inherit from album
				const finalArtistIds =
					songArtistIds.length > 0
						? songArtistIds
						: album?.albumArtists?.map((aa) => aa.artistId) || [];

				// Handle artwork
				let artworkPath: string | undefined = undefined;

				if (useEmbeddedArtwork && fileData.metadata.artwork) {
					// Save embedded artwork to disk
					const artworkData = fileData.metadata.artwork;
					const extension = artworkData.mimeType === 'image/png' ? 'png' : 'jpg';
					const artworkFilename = `${Date.now()}-artwork.${extension}`;
					const artworkFilepath = join('static', 'uploads', 'artwork', artworkFilename);

					// Decode base64 and save
					const artworkBuffer = Buffer.from(artworkData.data, 'base64');
					await writeFile(artworkFilepath, artworkBuffer);

					artworkPath = `/uploads/artwork/${artworkFilename}`;
				} else if (album?.artworkPath) {
					// Inherit from album
					artworkPath = album.artworkPath;
				}

				// Use album ID from form data if available, otherwise use album ID from file data

				const finalAlbumId = albumId
					? parseInt(albumId)
					: fileData.albumId
						? parseInt(fileData.albumId)
						: undefined;

				console.log('[createSongsWithMetadata] Final album ID:', finalAlbumId);

				// Create the song
				const song = await createSong({
					name: fileData.metadata.title || fileData.originalFilename,
					filepath: fileData.filepath,

					albumId: finalAlbumId,
					artworkPath,
					artistIds: finalArtistIds,
					genre: fileData.metadata.genre,
					year: fileData.metadata.year,
					producer: fileData.metadata.producer,
					trackNumber: fileData.metadata.trackNumber,
					duration: fileData.metadata.duration
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

	cleanupFiles: async ({ request }) => {
		try {
			const formData = await request.formData();
			const filepathsStr = formData.get('filepaths') as string;

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
