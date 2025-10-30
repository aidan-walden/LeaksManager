import { db } from './index';
import {
	artists,
	albums,
	songs,
	albumArtists,
	songArtists,
	producers,
	songProducers,
	producerAliases,
	producerAliasArtists,
	settings
} from './schema';
import { eq, sql, inArray, and, ne } from 'drizzle-orm';

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
 * Get a song with all its artists and producers
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
			songProducers: {
				with: {
					producer: true
				},
				orderBy: (songProducers, { asc }) => [asc(songProducers.order)]
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
 * Add producers to a song
 */
export async function addProducersToSong(songId: number, producerIds: number[]) {
	const values = producerIds.map((producerId, index) => ({
		songId,
		producerId,
		order: index
	}));

	await db.insert(songProducers).values(values);
}

/**
 * Remove all producers from a song and set new ones
 */
export async function setSongProducers(songId: number, producerIds: number[]) {
	// Delete existing
	await db.delete(songProducers).where(eq(songProducers.songId, songId));

	// Add new
	if (producerIds.length > 0) {
		await addProducersToSong(songId, producerIds);
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

export async function deleteAlbum(albumId: number) {
	return await db.transaction(async (tx) => {
		await tx.update(songs).set({ albumId: null }).where(eq(songs.albumId, albumId));
		await tx.delete(albumArtists).where(eq(albumArtists.albumId, albumId));
		return await tx.delete(albums).where(eq(albums.id, albumId)).returning();
	});
}

/**
 * Create a new song with artists
 */
export async function createSong(data: {
	name: string;
	filepath: string;
	artistIds?: number[]; // Optional - songs can exist without artists
	producerIds?: number[];
	albumId?: number;
	artworkPath?: string;
	genre?: string;
	year?: number;
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

	// Do the same for producers
	if (data.producerIds && data.producerIds.length > 0) {
		const producerLinks = data.producerIds.map((producerId, index) => ({
			songId: song.id,
			producerId,
			order: index
		}));

		await db.insert(songProducers).values(producerLinks);
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

/**
 * Get all albums with songs included (for song count)
 */
export async function getAlbumsWithSongs(params: { limit?: number; offset?: number }) {
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
			},
			songs: true
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
			songProducers: {
				with: {
					producer: true
				},
				orderBy: (songProducers, { asc }) => [asc(songProducers.order)]
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
			songProducers: {
				with: {
					producer: true
				},
				orderBy: (songProducers, { asc }) => [asc(songProducers.order)]
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
 * Get all songs that are part of the album specified by albumId
 */
export async function getSongsFromAlbum(albumId: number) {
	const foundSongs = await db.query.songs.findMany({
		where: eq(songs.id, albumId)
	});

	return foundSongs;
}

export async function getSongsByProducer(producerId: number) {
	const foundSongs = await db.query.songProducers.findMany({
		where: eq(songProducers.producerId, producerId)
	});

	return foundSongs;
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

export async function findProducerByNameCaseInsensitive(name: string) {
	const result = await db
		.select()
		.from(producers)
		.where(sql`LOWER(${producers.name}) = LOWER(${name})`)
		.limit(1);

	return result[0] || null;
}

/**
 * Get all producers with pagination
 */
export async function getProducers(params?: { limit?: number; offset?: number }) {
	const limit = params?.limit;
	const offset = params?.offset ?? 0;

	const producerList = await db.query.producers.findMany({
		limit,
		offset,
		with: {
			songProducers: {
				with: {
					song: true
				}
			},
			producerAliases: {
				with: {
					producerAliasArtists: {
						with: {
							artist: true
						}
					}
				}
			}
		}
	});

	return producerList;
}

/**
 * Get total count of producers (useful for pagination)
 */
export async function getProducersCount() {
	const result = await db.select({ count: sql<number>`count(*)` }).from(producers);

	return result[0].count;
}

/**
 * Create a new producer
 */
export async function createProducer(data: {
	name: string;
	additionalMetadata?: Record<string, any>;
}) {
	const result = await db
		.insert(producers)
		.values({
			name: data.name,
			additionalMetadata: data.additionalMetadata
		})
		.returning();

	return result[0];
}

/**
 * Delete a producer
 */
export async function deleteProducer(producerId: number) {
	// Delete the producer (junction table entries cascade automatically)
	await db.delete(producers).where(eq(producers.id, producerId));
}

/**
 * Create a producer with aliases
 */
export async function createProducerWithAliases(data: {
	name: string;
	aliases?: Array<{
		name: string;
		artistIds?: number[];
	}>;
	additionalMetadata?: Record<string, any>;
}) {
	return await db.transaction(async (tx) => {
		// Create the producer
		const producerResult = await tx
			.insert(producers)
			.values({
				name: data.name,
				additionalMetadata: data.additionalMetadata
			})
			.returning();

		const producer = producerResult[0];

		// Create aliases if provided
		if (data.aliases && data.aliases.length > 0) {
			for (const alias of data.aliases) {
				// Check if alias already exists (case-insensitive)
				const existingAlias = await tx
					.select()
					.from(producerAliases)
					.where(sql`LOWER(${producerAliases.alias}) = LOWER(${alias.name})`)
					.limit(1);

				if (existingAlias.length > 0) {
					throw new Error(`Alias "${alias.name}" already exists for another producer`);
				}

				// Create the alias
				const aliasResult = await tx
					.insert(producerAliases)
					.values({
						producerId: producer.id,
						alias: alias.name
					})
					.returning();

				const createdAlias = aliasResult[0];

				// Create artist restrictions if provided
				if (alias.artistIds && alias.artistIds.length > 0) {
					const artistLinks = alias.artistIds.map((artistId) => ({
						aliasId: createdAlias.id,
						artistId
					}));

					await tx.insert(producerAliasArtists).values(artistLinks);
				}
			}
		}

		return producer;
	});
}

export async function updateProducerWithAliases(data: {
	id: number;
	name: string;
	aliases?: Array<{
		name: string;
		artistIds?: number[];
	}>;
}) {
	return await db.transaction(async (tx) => {
		if (data.aliases && data.aliases.length > 0) {
			for (const alias of data.aliases) {
				const conflictingAlias = await tx
					.select({ id: producerAliases.id })
					.from(producerAliases)
					.where(
						and(
							sql`LOWER(${producerAliases.alias}) = LOWER(${alias.name})`,
							ne(producerAliases.producerId, data.id)
						)
					)
					.limit(1);

				if (conflictingAlias.length > 0) {
					throw new Error(`Alias "${alias.name}" already exists for another producer`);
				}
			}
		}

		await tx.update(producers).set({ name: data.name }).where(eq(producers.id, data.id));

		const existingAliases = await tx
			.select({ id: producerAliases.id })
			.from(producerAliases)
			.where(eq(producerAliases.producerId, data.id));

		if (existingAliases.length > 0) {
			const aliasIds = existingAliases.map((alias) => alias.id);
			await tx.delete(producerAliasArtists).where(inArray(producerAliasArtists.aliasId, aliasIds));
			await tx.delete(producerAliases).where(eq(producerAliases.producerId, data.id));
		}

		if (data.aliases && data.aliases.length > 0) {
			for (const alias of data.aliases) {
				const aliasResult = await tx
					.insert(producerAliases)
					.values({
						producerId: data.id,
						alias: alias.name
					})
					.returning();

				const createdAlias = aliasResult[0];

				if (alias.artistIds && alias.artistIds.length > 0) {
					const artistLinks = alias.artistIds.map((artistId) => ({
						aliasId: createdAlias.id,
						artistId
					}));

					await tx.insert(producerAliasArtists).values(artistLinks);
				}
			}
		}

		return await tx.query.producers.findFirst({
			where: eq(producers.id, data.id),
			with: {
				producerAliases: {
					with: {
						producerAliasArtists: {
							with: {
								artist: true
							}
						}
					}
				}
			}
		});
	});
}

/**
 * Get a producer with all its aliases
 */
export async function getProducerWithAliases(producerId: number) {
	return await db.query.producers.findFirst({
		where: eq(producers.id, producerId),
		with: {
			producerAliases: {
				with: {
					producerAliasArtists: {
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
 * Get all producers with their aliases
 */
export async function getAllProducersWithAliases(params?: { limit?: number; offset?: number }) {
	const limit = params?.limit;
	const offset = params?.offset ?? 0;

	return await db.query.producers.findMany({
		limit,
		offset,
		with: {
			producerAliases: {
				with: {
					producerAliasArtists: {
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
 * Find a producer by alias name (case-insensitive)
 * Optionally filters by artist context - if songArtistIds provided, only returns
 * producer if the alias is global OR if the alias is restricted to one of the song's artists
 */
export async function getProducerByAlias(aliasName: string, songArtistIds?: number[]) {
	// Find the alias (case-insensitive)
	const aliasResult = await db
		.select()
		.from(producerAliases)
		.where(sql`LOWER(${producerAliases.alias}) = LOWER(${aliasName})`)
		.limit(1);

	if (aliasResult.length === 0) {
		return null;
	}

	const alias = aliasResult[0];

	// If no artist context provided, return the producer
	if (!songArtistIds || songArtistIds.length === 0) {
		const producer = await db.query.producers.findFirst({
			where: eq(producers.id, alias.producerId)
		});
		return producer || null;
	}

	// Check if this alias has artist restrictions
	const artistRestrictions = await db
		.select()
		.from(producerAliasArtists)
		.where(eq(producerAliasArtists.aliasId, alias.id));

	// If no artist restrictions, it's global - return the producer
	if (artistRestrictions.length === 0) {
		const producer = await db.query.producers.findFirst({
			where: eq(producers.id, alias.producerId)
		});
		return producer || null;
	}

	// Check if any of the song's artists match the alias restrictions
	const restrictedArtistIds = artistRestrictions.map((r) => r.artistId);
	const hasMatchingArtist = songArtistIds.some((id) => restrictedArtistIds.includes(id));

	if (hasMatchingArtist) {
		const producer = await db.query.producers.findFirst({
			where: eq(producers.id, alias.producerId)
		});
		return producer || null;
	}

	// Artist context doesn't match - don't return the producer
	return null;
}

export async function updateSong(
	songId: number,
	data: {
		name?: string;
		albumId?: number;
		artistIds?: number[];
		producerIds?: number[];
		artworkPath?: string;
		genre?: string;
		year?: number;
		trackNumber?: number | null;
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

	if (data.producerIds) {
		await setSongProducers(songId, data.producerIds);
	}
}

export async function deleteSong(songId: number) {
	return await db.delete(songs).where(eq(songs.id, songId)).returning();
}

/**
 * Get application settings (singleton)
 * Automatically initializes settings if they don't exist
 */
export async function getSettings() {
	let result = await db.query.settings.findFirst({
		where: eq(settings.id, 1)
	});

	// Initialize default settings if none exist
	if (!result) {
		await db.insert(settings).values({ id: 1 });
		result = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
	}

	return result!;
}

/**
 * Update application settings
 */
export async function updateSettings(updates: Partial<typeof settings.$inferInsert>) {
	return await db
		.update(settings)
		.set({ ...updates, updatedAt: new Date() })
		.where(eq(settings.id, 1))
		.returning();
}
