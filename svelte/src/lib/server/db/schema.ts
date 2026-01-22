import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const songs = sqliteTable('songs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	albumId: integer('album_id').references(() => albums.id, { onDelete: 'set null' }),
	artworkPath: text('artwork_path'),
	genre: text('genre'),
	year: integer('year'),
	trackNumber: integer('track_number'),
	duration: real('duration'),
	filepath: text('filepath').notNull(),
	fileType: text('file_type'),
	syncedToItunes: integer('synced_to_itunes', { mode: 'boolean' }).default(false).notNull(),
	appleMusicId: text('apple_music_id'),
	additionalMetadata: text('additional_metadata'),
	createdAt: integer('created_at'),
	updatedAt: integer('updated_at'),
	synced: integer('synced', { mode: 'boolean' }).default(false)
});

export const albums = sqliteTable('albums', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	artworkPath: text('artwork_path'),
	genre: text('genre'),
	year: integer('year'),
	additionalMetadata: text('additional_metadata'),
	createdAt: integer('created_at'),
	updatedAt: integer('updated_at'),
	synced: integer('synced', { mode: 'boolean' }).default(false)
});

export const artists = sqliteTable('artists', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	careerStartYear: integer('career_start_year'),
	careerEndYear: integer('career_end_year'),
	additionalMetadata: text('additional_metadata'),
	createdAt: integer('created_at'),
	updatedAt: integer('updated_at'),
	image: text('image'),
	synced: integer('synced', { mode: 'boolean' }).default(false)
});

export const albumArtists = sqliteTable(
	'album_artists',
	{
		albumId: integer('album_id')
			.notNull()
			.references(() => albums.id, { onDelete: 'cascade' }),
		artistId: integer('artist_id')
			.notNull()
			.references(() => artists.id, { onDelete: 'cascade' }),
		order: integer('order').default(0),
		createdAt: integer('created_at')
	},
	(t) => ({
		pk: primaryKey({ columns: [t.albumId, t.artistId] })
	})
);

export const songArtists = sqliteTable(
	'song_artists',
	{
		songId: integer('song_id')
			.notNull()
			.references(() => songs.id, { onDelete: 'cascade' }),
		artistId: integer('artist_id')
			.notNull()
			.references(() => artists.id, { onDelete: 'cascade' }),
		order: integer('order').default(0),
		createdAt: integer('created_at')
	},
	(t) => ({
		pk: primaryKey({ columns: [t.songId, t.artistId] })
	})
);

export const producers = sqliteTable('producers', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	additionalMetadata: text('additional_metadata'),
	createdAt: integer('created_at'),
	updatedAt: integer('updated_at')
});

export const songProducers = sqliteTable(
	'song_producers',
	{
		songId: integer('song_id')
			.notNull()
			.references(() => songs.id, { onDelete: 'cascade' }),
		producerId: integer('producer_id')
			.notNull()
			.references(() => producers.id, { onDelete: 'cascade' }),
		order: integer('order').default(0),
		createdAt: integer('created_at')
	},
	(t) => ({
		pk: primaryKey({ columns: [t.songId, t.producerId] })
	})
);

export const settings = sqliteTable('settings', {
	id: integer('id').primaryKey().default(1),
	clearTrackNumberOnUpload: integer('clear_track_number_on_upload', { mode: 'boolean' })
		.default(false)
		.notNull(),
	importToAppleMusic: integer('import_to_apple_music', { mode: 'boolean' })
		.default(false)
		.notNull(),
	automaticallyMakeSingles: integer('automatically_make_singles', { mode: 'boolean' })
		.default(false)
		.notNull(),
	updatedAt: integer('updated_at')
});

export const producerAliases = sqliteTable('producer_aliases', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	producerId: integer('producer_id')
		.notNull()
		.references(() => producers.id, { onDelete: 'cascade' }),
	alias: text('alias').notNull().unique(),
	createdAt: integer('created_at')
});

export const producerAliasArtists = sqliteTable(
	'producer_alias_artists',
	{
		aliasId: integer('alias_id')
			.notNull()
			.references(() => producerAliases.id, { onDelete: 'cascade' }),
		artistId: integer('artist_id')
			.notNull()
			.references(() => artists.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at')
	},
	(t) => ({
		pk: primaryKey({ columns: [t.aliasId, t.artistId] })
	})
);

// Relations

export const songsRelations = relations(songs, ({ one, many }) => ({
	album: one(albums, {
		fields: [songs.albumId],
		references: [albums.id]
	}),
	artists: many(songArtists),
	producers: many(songProducers)
}));

export const albumsRelations = relations(albums, ({ many }) => ({
	songs: many(songs),
	artists: many(albumArtists)
}));

export const artistsRelations = relations(artists, ({ many }) => ({
	albumArtists: many(albumArtists),
	songArtists: many(songArtists),
	producerAliasArtists: many(producerAliasArtists)
}));

export const albumArtistsRelations = relations(albumArtists, ({ one }) => ({
	album: one(albums, {
		fields: [albumArtists.albumId],
		references: [albums.id]
	}),
	artist: one(artists, {
		fields: [albumArtists.artistId],
		references: [artists.id]
	})
}));

export const songArtistsRelations = relations(songArtists, ({ one }) => ({
	song: one(songs, {
		fields: [songArtists.songId],
		references: [songs.id]
	}),
	artist: one(artists, {
		fields: [songArtists.artistId],
		references: [artists.id]
	})
}));

export const producersRelations = relations(producers, ({ many }) => ({
	songs: many(songProducers),
	aliases: many(producerAliases)
}));

export const songProducersRelations = relations(songProducers, ({ one }) => ({
	song: one(songs, {
		fields: [songProducers.songId],
		references: [songs.id]
	}),
	producer: one(producers, {
		fields: [songProducers.producerId],
		references: [producers.id]
	})
}));

export const producerAliasesRelations = relations(producerAliases, ({ one, many }) => ({
	producer: one(producers, {
		fields: [producerAliases.producerId],
		references: [producers.id]
	}),
	artists: many(producerAliasArtists)
}));

export const producerAliasArtistsRelations = relations(producerAliasArtists, ({ one }) => ({
	alias: one(producerAliases, {
		fields: [producerAliasArtists.aliasId],
		references: [producerAliases.id]
	}),
	artist: one(artists, {
		fields: [producerAliasArtists.artistId],
		references: [artists.id]
	})
}));
