import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const artists = sqliteTable('artists', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	careerStartYear: integer('career_start_year'),
	careerEndYear: integer('career_end_year'),
	additionalMetadata: text('additional_metadata', { mode: 'json' }).$type<Record<string, any>>(),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

export const producers = sqliteTable('producers', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	additionalMetadata: text('additional_metadata', { mode: 'json' }).$type<Record<string, any>>(),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

export const settings = sqliteTable('settings', {
	id: integer('id').primaryKey().default(1),
	clearTrackNumberOnUpload: integer('clear_track_number_on_upload', { mode: 'boolean' })
		.notNull()
		.default(false),
	importToAppleMusic: integer('import_to_apple_music', { mode: 'boolean' })
		.notNull()
		.default(false),
	automaticallyMakeSingles: integer('automatically_make_singles', { mode: 'boolean' })
		.notNull()
		.default(false),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

export const albums = sqliteTable('albums', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	artworkPath: text('artwork_path'),
	genre: text('genre'),
	year: integer('year'),
	additionalMetadata: text('additional_metadata', { mode: 'json' }).$type<Record<string, any>>(),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

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
	additionalMetadata: text('additional_metadata', { mode: 'json' }).$type<Record<string, any>>(),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
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
		createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
	},
	(table) => [primaryKey({ columns: [table.albumId, table.artistId] })]
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
		createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
	},
	(table) => [primaryKey({ columns: [table.songId, table.artistId] })]
);

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
		createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
	},
	(table) => [primaryKey({ columns: [table.songId, table.producerId] })]
);

// Relations
export const artistsRelations = relations(artists, ({ many }) => ({
	albumArtists: many(albumArtists),
	songArtists: many(songArtists)
}));

export const producersRelations = relations(producers, ({ many }) => ({
	songProducers: many(songProducers)
}));

export const albumsRelations = relations(albums, ({ many }) => ({
	songs: many(songs),
	albumArtists: many(albumArtists)
}));

export const songsRelations = relations(songs, ({ one, many }) => ({
	album: one(albums, {
		fields: [songs.albumId],
		references: [albums.id]
	}),
	songArtists: many(songArtists),
	songProducers: many(songProducers)
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

// Type exports
export type Artist = typeof artists.$inferSelect;
export type NewArtist = typeof artists.$inferInsert;

export type Producer = typeof producers.$inferSelect;
export type NewProducer = typeof producers.$inferInsert;

export type Album = typeof albums.$inferSelect;
export type NewAlbum = typeof albums.$inferInsert;

export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;

export type AlbumArtist = typeof albumArtists.$inferSelect;
export type NewAlbumArtist = typeof albumArtists.$inferInsert;

export type SongArtist = typeof songArtists.$inferSelect;
export type NewSongArtist = typeof songArtists.$inferInsert;

export type SongProducer = typeof songProducers.$inferSelect;
export type NewSongProducer = typeof songProducers.$inferInsert;

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

export type SongWithRelations = Song & {
	album: Album | null;
	songArtists: (SongArtist & { artist: Artist | null })[];
	songProducers: (SongProducer & { producer: Producer | null })[];
};
