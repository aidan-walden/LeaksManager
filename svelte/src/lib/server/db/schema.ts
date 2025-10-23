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
	producer: text('producer'),
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

// Relations
export const artistsRelations = relations(artists, ({ many }) => ({
	albumArtists: many(albumArtists),
	songArtists: many(songArtists)
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
	songArtists: many(songArtists)
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

// Type exports
export type Artist = typeof artists.$inferSelect;
export type NewArtist = typeof artists.$inferInsert;

export type Album = typeof albums.$inferSelect;
export type NewAlbum = typeof albums.$inferInsert;

export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;

export type AlbumArtist = typeof albumArtists.$inferSelect;
export type NewAlbumArtist = typeof albumArtists.$inferInsert;

export type SongArtist = typeof songArtists.$inferSelect;
export type NewSongArtist = typeof songArtists.$inferInsert;

export type SongWithRelations = Song & {
	album: Album | null;
	songArtists: (SongArtist & { artist: Artist | null })[];
};
