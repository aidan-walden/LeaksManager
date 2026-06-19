import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from '../db/migrate';
import { registerLower } from '../db/connection';
import { createArtist } from './artists';
import { createAlbum } from './albums';
import { createSong } from './songs';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../backend/migrations');

// SC-003 / data-model sync invariant: editing a metadata-affecting column must flip
// synced=0 for exactly the affected row(s), driven by the triggers in
// backend/migrations/000002_sync_triggers.up.sql (reused verbatim by db/migrate.ts).
//
// We seed two songs (and, where relevant, an album/artist), set everyone synced=1,
// then perform a single trigger-watched edit and assert exactly the right rows dirty.
describe('sync triggers flip synced=0 for exactly the affected rows (SC-003)', () => {
	let db: Database.Database;

	beforeEach(() => {
		db = new Database(':memory:');
		registerLower(db);
		migrate(db, MIGRATIONS_DIR);
	});

	const synced = (table: string, id: number): number =>
		(db.prepare(`SELECT synced FROM ${table} WHERE id = ?`).get(id) as { synced: number }).synced;

	function seedSong(albumId: number | null, name = 'Track'): number {
		const artist = createArtist(db, { name: `Artist ${name}` });
		return createSong(db, {
			name,
			filepath: `uploads/songs/${name}.mp3`,
			artistIds: [artist.id],
			producerIds: [],
			albumId
		}).id;
	}

	const markAllSynced = () => {
		db.exec(`UPDATE songs SET synced = 1; UPDATE albums SET synced = 1; UPDATE artists SET synced = 1`);
	};

	// song_metadata_update_cascade: AFTER UPDATE OF name, genre, year, track_number,
	// artwork_path ON songs -> UPDATE songs SET synced = 0 WHERE id = NEW.id;
	it('direct song metadata edit dirties only that song (song_metadata_update_cascade)', () => {
		const a = seedSong(null, 'A');
		const b = seedSong(null, 'B');
		markAllSynced();

		db.prepare(`UPDATE songs SET genre = 'Rap' WHERE id = ?`).run(a);

		expect(synced('songs', a)).toBe(0);
		expect(synced('songs', b)).toBe(1);
	});

	// The trigger has a WHEN guard (OLD col IS NOT NEW col): a no-op write must not dirty.
	it('no-op write to a watched column does not dirty the song', () => {
		const a = seedSong(null, 'A');
		db.prepare(`UPDATE songs SET genre = 'Rap' WHERE id = ?`).run(a);
		db.prepare(`UPDATE songs SET synced = 1 WHERE id = ?`).run(a);

		db.prepare(`UPDATE songs SET genre = 'Rap' WHERE id = ?`).run(a); // same value

		expect(synced('songs', a)).toBe(1);
	});

	// album_metadata_update_cascade: AFTER UPDATE OF name, year, genre, artwork_path ON
	// albums -> dirties the album AND every song with album_id = NEW.id.
	it('album metadata edit cascades to album + its songs only (album_metadata_update_cascade)', () => {
		const artist = createArtist(db, { name: 'Band' });
		const album = createAlbum(db, { name: 'Album', artistIds: [artist.id] });
		const inAlbum = createSong(db, {
			name: 'In',
			filepath: 'uploads/songs/in.mp3',
			artistIds: [artist.id],
			producerIds: [],
			albumId: album.id
		}).id;
		const standalone = seedSong(null, 'Out');
		markAllSynced();

		db.prepare(`UPDATE albums SET genre = 'Jazz' WHERE id = ?`).run(album.id);

		expect(synced('albums', album.id)).toBe(0);
		expect(synced('songs', inAlbum)).toBe(0);
		expect(synced('songs', standalone)).toBe(1);
	});

	// song_artists_insert_cascade: AFTER INSERT ON song_artists -> dirties NEW.song_id.
	it('adding a song-artist link dirties only that song (song_artists_insert_cascade)', () => {
		const a = seedSong(null, 'A');
		const b = seedSong(null, 'B');
		const extra = createArtist(db, { name: 'Feature' });
		markAllSynced();

		db.prepare(
			`INSERT INTO song_artists (song_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`
		).run(a, extra.id, 1, Date.now());

		expect(synced('songs', a)).toBe(0);
		expect(synced('songs', b)).toBe(1);
	});

	// artist_name_update_cascade: AFTER UPDATE OF name ON artists -> dirties the artist,
	// its songs (via song_artists), and its albums (via album_artists). Renaming an
	// artist tied to one song must leave an unrelated song clean.
	it('artist rename cascades to its song only (artist_name_update_cascade)', () => {
		const artistA = createArtist(db, { name: 'Old Name' });
		const a = createSong(db, {
			name: 'A',
			filepath: 'uploads/songs/a.mp3',
			artistIds: [artistA.id],
			producerIds: [],
			albumId: null
		}).id;
		const b = seedSong(null, 'B');
		markAllSynced();

		db.prepare(`UPDATE artists SET name = 'New Name' WHERE id = ?`).run(artistA.id);

		expect(synced('artists', artistA.id)).toBe(0);
		expect(synced('songs', a)).toBe(0);
		expect(synced('songs', b)).toBe(1);
	});
});
