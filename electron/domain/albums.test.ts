import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from '../db/migrate';
import { configureConnection } from '../db/connection';
import { createArtist } from './artists';
import { createAlbum, deleteAlbum } from './albums';
import { createSong } from './songs';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../migrations');

describe('albums', () => {
	let db: Database.Database;
	let artistId: number;

	beforeEach(() => {
		db = new Database(':memory:');
		configureConnection(db);
		migrate(db, MIGRATIONS_DIR);
		artistId = createArtist(db, { name: 'Band' }).id;
	});

	const seedSong = (albumId: number) =>
		createSong(db, {
			name: 'Track',
			filepath: `uploads/songs/${albumId}.mp3`,
			artistIds: [artistId],
			producerIds: [],
			albumId
		}).id;

	it('deleting an album unlinks and dirties its songs and removes its artist links', () => {
		const album = createAlbum(db, { name: 'Album', artistIds: [artistId] });
		const songId = seedSong(album.id);
		db.exec('UPDATE songs SET synced = 1');

		deleteAlbum(db, album.id);

		const song = db.prepare('SELECT album_id, synced FROM songs WHERE id = ?').get(songId);
		expect(song).toEqual({ album_id: null, synced: 0 });
		expect(db.prepare('SELECT COUNT(*) AS c FROM album_artists').get()).toEqual({ c: 0 });
		expect(db.prepare('SELECT COUNT(*) AS c FROM albums').get()).toEqual({ c: 0 });
	});
});
