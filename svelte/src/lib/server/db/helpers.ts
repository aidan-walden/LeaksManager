import { db } from './index';
import { artists, albums, songs, albumArtists, songArtists } from './schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Get an album with all its artists
 */
export async function getAlbumWithArtists(albumId: number) {
	return await db.query.albums.findFirst({
		where: eq(albums.id, albumId),
		with: {
			albumArtists: {
				with: {
					artist: true
				},
				orderBy: (albumArtists, { asc }) => [asc(albumArtists.order)]
			},
			songs: true
		}
	});
}

/**
 * Get a song with all its artists
 */
export async function getSongWithArtists(songId: number) {
	return await db.query.songs.findFirst({
		where: eq(songs.id, songId),
		with: {
			songArtists: {
				with: {
					artist: true
				},
				orderBy: (songArtists, { asc }) => [asc(songArtists.order)]
			},
			album: {
				with: {
					albumArtists: {
						with: {
							artist: true
						}
					}
				}
			}
		}
	});
}

/**
 * Add artists to an album
 */
export async function addArtistsToAlbum(albumId: number, artistIds: number[]) {
	const values = artistIds.map((artistId, index) => ({
		albumId,
		artistId,
		order: index
	}));

	await db.insert(albumArtists).values(values);
}

/**
 * Add artists to a song
 */
export async function addArtistsToSong(songId: number, artistIds: number[]) {
	const values = artistIds.map((artistId, index) => ({
		songId,
		artistId,
		order: index
	}));

	await db.insert(songArtists).values(values);
}

/**
 * Remove all artists from an album and set new ones
 */
export async function setAlbumArtists(albumId: number, artistIds: number[]) {
	// Delete existing
	await db.delete(albumArtists).where(eq(albumArtists.albumId, albumId));

	// Add new
	if (artistIds.length > 0) {
		await addArtistsToAlbum(albumId, artistIds);
	}
}

/**
 * Remove all artists from a song and set new ones
 */
export async function setSongArtists(songId: number, artistIds: number[]) {
	// Delete existing
	await db.delete(songArtists).where(eq(songArtists.songId, songId));

	// Add new
	if (artistIds.length > 0) {
		await addArtistsToSong(songId, artistIds);
	}
}

/**
 * Get all albums by an artist
 */
export async function getAlbumsByArtist(artistId: number) {
	const result = await db.query.albumArtists.findMany({
		where: eq(albumArtists.artistId, artistId),
		with: {
			album: {
				with: {
					albumArtists: {
						with: {
							artist: true
						}
					}
				}
			}
		}
	});

	return result.map((r) => r.album);
}

/**
 * Get all songs by an artist
 */
export async function getSongsByArtist(artistId: number) {
	const result = await db.query.songArtists.findMany({
		where: eq(songArtists.artistId, artistId),
		with: {
			song: {
				with: {
					songArtists: {
						with: {
							artist: true
						}
					},
					album: true
				}
			}
		}
	});

	return result.map((r) => r.song);
}

/**
 * Delete an artist with cascade option for their associations
 */
export async function deleteArtist(artistId: number, cascadeContent = false) {
	if (cascadeContent) {
		// Get all albums where this is the ONLY artist
		const artistAlbums = await db.query.albumArtists.findMany({
			where: eq(albumArtists.artistId, artistId),
			with: {
				album: {
					with: {
						albumArtists: true
					}
				}
			}
		});

		for (const { album } of artistAlbums) {
			// If this artist is the only artist on the album, delete the album
			if (album.albumArtists.length === 1) {
				await db.delete(songs).where(eq(songs.albumId, album.id));
				await db.delete(albums).where(eq(albums.id, album.id));
			}
		}

		// Get all songs where this is the ONLY artist
		const artistSongs = await db.query.songArtists.findMany({
			where: eq(songArtists.artistId, artistId),
			with: {
				song: {
					with: {
						songArtists: true
					}
				}
			}
		});

		for (const { song } of artistSongs) {
			// If this artist is the only artist on the song, delete the song
			if (song.songArtists.length === 1) {
				await db.delete(songs).where(eq(songs.id, song.id));
			}
		}
	}

	// Delete the artist (junction table entries cascade automatically)
	await db.delete(artists).where(eq(artists.id, artistId));
}

/**
 * Get song with artwork resolution (inherit from album if not set)
 */
export async function getSongWithArtwork(songId: number) {
	const song = await getSongWithArtists(songId);

	if (!song) return null;

	return {
		...song,
		effectiveArtwork: song.artworkPath || song.album?.artworkPath || null
	};
}

/**
 * Create a new artist
 */
export async function createArtist(data: {
	name: string;
	careerStartYear?: number;
	careerEndYear?: number;
	additionalMetadata?: Record<string, any>;
}) {
	const result = await db
		.insert(artists)
		.values({
			name: data.name,
			careerStartYear: data.careerStartYear,
			careerEndYear: data.careerEndYear,
			additionalMetadata: data.additionalMetadata
		})
		.returning();

	return result[0];
}

/**
 * Create a new album with artists
 */
export async function createAlbum(data: {
	name: string;
	artistIds: number[]; // At least one artist required
	artworkPath?: string;
	genre?: string;
	year?: number;
	additionalMetadata?: Record<string, any>;
}) {
	if (data.artistIds.length === 0) {
		throw new Error('Album must have at least one artist');
	}

	// Create the album
	const result = await db
		.insert(albums)
		.values({
			name: data.name,
			artworkPath: data.artworkPath,
			genre: data.genre,
			year: data.year,
			additionalMetadata: data.additionalMetadata
		})
		.returning();

	const album = result[0];

	// Link artists to the album
	const artistLinks = data.artistIds.map((artistId, index) => ({
		albumId: album.id,
		artistId,
		order: index
	}));

	await db.insert(albumArtists).values(artistLinks);

	return album;
}

export async function updateAlbum(
	albumId: number,
	data: {
		name?: string;
		artworkPath?: string;
		genre?: string;
		year?: number;
		additionalMetadata?: Record<string, any>;
	}
) {
	await db
		.update(albums)
		.set({
			...data
		})
		.where(eq(albums.id, albumId));
}

/**
 * Create a new song with artists
 */
export async function createSong(data: {
	name: string;
	filepath: string;
	artistIds?: number[]; // Optional - songs can exist without artists
	albumId?: number;
	artworkPath?: string;
	genre?: string;
	year?: number;
	producer?: string;
	trackNumber?: number;
	duration?: number;
	fileType?: string;
	additionalMetadata?: Record<string, any>;
}) {
	// Create the song
	const result = await db
		.insert(songs)
		.values({
			name: data.name,
			filepath: data.filepath,
			albumId: data.albumId,
			artworkPath: data.artworkPath,
			genre: data.genre,
			year: data.year,
			producer: data.producer,
			trackNumber: data.trackNumber,
			duration: data.duration,
			fileType: data.fileType,
			additionalMetadata: data.additionalMetadata
		})
		.returning();

	const song = result[0];

	// Link artists to the song if provided
	if (data.artistIds && data.artistIds.length > 0) {
		const artistLinks = data.artistIds.map((artistId, index) => ({
			songId: song.id,
			artistId,
			order: index
		}));

		await db.insert(songArtists).values(artistLinks);
	}

	return song;
}

/**
 * Get all albums with pagination
 */
export async function getAlbums(params: { limit?: number; offset?: number }) {
	const limit = params.limit ?? 50;
	const offset = params.offset ?? 0;

	const albums = await db.query.albums.findMany({
		limit,
		offset,
		with: {
			albumArtists: {
				with: {
					artist: true
				},
				orderBy: (albumArtists, { asc }) => [asc(albumArtists.order)]
			}
		},
		orderBy: (albums, { desc }) => [desc(albums.createdAt)]
	});

	return albums;
}

export async function getAlbumById(albumId: number) {
	return await db.query.albums.findFirst({
		where: eq(albums.id, albumId)
	});
}

/**
 * Get total count of albums (useful for pagination)
 */
export async function getAlbumsCount() {
	const result = await db.select({ count: sql<number>`count(*)` }).from(albums);

	return result[0].count;
}

/**
 * Get all songs with pagination
 */
export async function getSongs(params: { limit?: number; offset?: number }) {
	const limit = params.limit ?? 50;
	const offset = params.offset ?? 0;

	const songs = await db.query.songs.findMany({
		limit,
		offset,
		with: {
			songArtists: {
				with: {
					artist: true
				},
				orderBy: (songArtists, { asc }) => [asc(songArtists.order)]
			},
			album: {
				with: {
					albumArtists: {
						with: {
							artist: true
						}
					}
				}
			}
		},
		orderBy: (songs, { desc }) => [desc(songs.createdAt)]
	});

	return songs;
}

export async function getSongsReadable(params: { limit?: number; offset?: number }) {
	const limit = params.limit ?? 50;
	const offset = params.offset ?? 0;

	const dbSongs = await db.query.songs.findMany({
		limit,
		offset,
		with: {
			songArtists: {
				with: {
					artist: true
				},
				orderBy: (songArtists, { asc }) => [asc(songArtists.order)]
			},
			album: true
		},
		orderBy: (songs, { desc }) => [desc(songs.createdAt)]
	});

	const songs = dbSongs.map((song) => ({
		...song,
		artist: song.songArtists.map((sa) => sa.artist.name).join(', ')
	}));
	return songs;
}

/**
 * Get total count of songs (useful for pagination)
 */
export async function getSongsCount() {
	const result = await db.select({ count: sql<number>`count(*)` }).from(songs);

	return result[0].count;
}

/**
 * Get all artists with pagination
 */
export async function getArtists(params?: { limit?: number; offset?: number }) {
	const limit = params?.limit;
	const offset = params?.offset ?? 0;

	const artists = await db.query.artists.findMany({
		limit,
		offset,
		with: {
			albumArtists: {
				with: {
					album: true
				}
			},
			songArtists: {
				with: {
					song: true
				}
			}
		}
	});

	return artists;
}

/**
 * Get total count of artists (useful for pagination)
 */
export async function getArtistsCount() {
	const result = await db.select({ count: sql<number>`count(*)` }).from(artists);

	return result[0].count;
}

export async function getArtistByName(name: string) {
	return await db.query.artists.findFirst({
		where: eq(artists.name, name)
	});
}

/**
 * Find an artist by name (case-insensitive)
 */
export async function findArtistByNameCaseInsensitive(name: string) {
	const result = await db
		.select()
		.from(artists)
		.where(sql`LOWER(${artists.name}) = LOWER(${name})`)
		.limit(1);

	return result[0] || null;
}

export async function findAlbumByNameCaseInsensitive(name: string) {
	const result = await db
		.select()
		.from(albums)
		.where(sql`LOWER(${albums.name}) = LOWER(${name})`)
		.limit(1);

	return result[0] || null;
}

export async function updateSong(
	songId: number,
	data: {
		name?: string;
		albumId?: number;
		artistIds?: number[];
		artworkPath?: string;
		genre?: string;
		year?: number;
		producer?: string;
		trackNumber?: number;
		additionalMetadata?: Record<string, any>;
	}
) {
	await db
		.update(songs)
		.set({
			...data
		})
		.where(eq(songs.id, songId));

	if (data.artistIds) {
		await setSongArtists(songId, data.artistIds);
	}
}

export async function deleteSong(songId: number) {
	return await db.delete(songs).where(eq(songs.id, songId)).returning();
}
