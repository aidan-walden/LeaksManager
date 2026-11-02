import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { migrate } from '../db/migrate';
import { configureConnection } from '../db/connection';
import { createArtist } from './artists';
import { createAlbum } from './albums';
import { createProducerWithAliases } from './producers';
import { createSong, deleteAlbumAndClearTags, deleteSong, writeAlbumMetadata } from './songs';
import { updateSettings } from './settings';
import { readMetadata } from '../metadata';
// buildSongTags is the T032 write-path port of backend/metadata.go buildSongTags.
// It assembles the cross-format tag payload from the DB (mediabunny MetadataTags)
// plus the resolved file path, mirroring the Go (SongTags, fullPath, error) return.
import { buildSongTags } from './songs';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../migrations');

// FR-009 — single vs. album track-number rule (oracle: backend/metadata.go buildSongTags).
//   no album + automaticallyMakeSingles  -> album "<name> - Single", trackNumber 1, tracksTotal 1
//   no album + !automaticallyMakeSingles -> no track number emitted
//   has album                            -> trackNumber/<album song count>
describe('buildSongTags single-vs-album track-number rule (FR-009)', () => {
	let db: Database.Database;
	let staticPath: string;

	beforeEach(() => {
		db = new Database(':memory:');
		configureConnection(db);
		migrate(db, MIGRATIONS_DIR);
		staticPath = mkdtempSync(join(tmpdir(), 'leaks-songtags-'));
		mkdirSync(join(staticPath, 'uploads', 'songs'), { recursive: true });
	});

	afterEach(() => {
		rmSync(staticPath, { recursive: true, force: true });
	});

	function seedSong(albumId: number | null): number {
		const artist = createArtist(db, { name: 'Solo Artist' });
		return createSong(db, {
			name: 'Solo Track',
			filepath: 'uploads/songs/solo.mp3',
			artistIds: [artist.id],
			producerIds: [],
			albumId
		}).id;
	}

	it('no album + automaticallyMakeSingles=true → "<name> - Single", track 1/1', () => {
		updateSettings(db, { automaticallyMakeSingles: true });
		const songId = seedSong(null);

		const { tags } = buildSongTags(db, staticPath, songId);

		expect(tags.album).toBe('Solo Track - Single');
		expect(tags.trackNumber).toBe(1);
		expect(tags.tracksTotal).toBe(1);
	});

	it('no album + automaticallyMakeSingles=false → no track number', () => {
		updateSettings(db, { automaticallyMakeSingles: false });
		const songId = seedSong(null);

		const { tags } = buildSongTags(db, staticPath, songId);

		// Go sets trackNumber=0 and leaves TrackNumberStr empty: no track tag written.
		expect(tags.trackNumber ?? 0).toBe(0);
		expect(tags.album ?? '').toBe('');
	});

	it('emits producers under all three format-native raw keys (TCOM/©wrt/PRODUCER)', () => {
		const artist = createArtist(db, { name: 'Solo Artist' });
		const p1 = createProducerWithAliases(db, { name: 'Alpha', aliases: [] });
		const p2 = createProducerWithAliases(db, { name: 'Beta', aliases: [] });
		const songId = createSong(db, {
			name: 'Produced Track',
			filepath: 'uploads/songs/produced.mp3',
			artistIds: [artist.id],
			producerIds: [p1.id, p2.id],
			albumId: null
		}).id;

		const { tags } = buildSongTags(db, staticPath, songId);

		// `, `-joined in song_producers order, under each format's composer/producer key.
		expect(tags.raw?.TCOM).toBe('Alpha, Beta');
		expect(tags.raw?.['©wrt']).toBe('Alpha, Beta');
		expect(tags.raw?.PRODUCER).toBe('Alpha, Beta');
	});

	it('joins artists, album artists and producers in their linked order, not by id', () => {
		const [first, second] = ['First', 'Second'].map((name) => createArtist(db, { name }).id);
		const [prodFirst, prodSecond] = ['Prod A', 'Prod B'].map(
			(name) => createProducerWithAliases(db, { name, aliases: [] }).id
		);
		const album = createAlbum(db, { name: 'Album', artistIds: [second, first] });
		const songId = createSong(db, {
			name: 'Ordered',
			filepath: 'uploads/songs/ordered.mp3',
			artistIds: [second, first],
			producerIds: [prodSecond, prodFirst],
			albumId: album.id
		}).id;

		const { tags } = buildSongTags(db, staticPath, songId);

		expect(tags.artist).toBe('Second, First');
		expect(tags.albumArtist).toBe('Second, First');
		expect(tags.raw?.PRODUCER).toBe('Prod B, Prod A');
	});

	it('omits producer raw keys when a song has none', () => {
		const songId = seedSong(null);
		const { tags } = buildSongTags(db, staticPath, songId);
		expect(tags.raw?.TCOM).toBeUndefined();
		expect(tags.raw?.['©wrt']).toBeUndefined();
		expect(tags.raw?.PRODUCER).toBeUndefined();
	});

	it('has album → trackNumber / album song count, regardless of singles setting', () => {
		updateSettings(db, { automaticallyMakeSingles: true });
		const artist = createArtist(db, { name: 'Band' });
		const album = createAlbum(db, { name: 'Real Album', artistIds: [artist.id] });

		const mk = (n: number) =>
			createSong(db, {
				name: `Track ${n}`,
				filepath: `uploads/songs/t${n}.mp3`,
				artistIds: [artist.id],
				producerIds: [],
				albumId: album.id,
				trackNumber: n
			}).id;

		mk(1);
		const songId = mk(2);
		mk(3);

		const { tags } = buildSongTags(db, staticPath, songId);

		expect(tags.album).toBe('Real Album');
		expect(tags.trackNumber).toBe(2);
		expect(tags.tracksTotal).toBe(3);
	});
});

// deleteSong relies on ON DELETE CASCADE to clear song_artists / song_producers.
// This only holds when foreign-key enforcement is enabled per-connection
// (configureConnection); without it the junction rows would orphan.
describe('deleteSong cascades to junction rows', () => {
	let db: Database.Database;
	let staticPath: string;

	beforeEach(() => {
		db = new Database(':memory:');
		configureConnection(db);
		migrate(db, MIGRATIONS_DIR);
		staticPath = mkdtempSync(join(tmpdir(), 'leaks-delsong-'));
		mkdirSync(join(staticPath, 'uploads', 'songs'), { recursive: true });
	});

	afterEach(() => {
		rmSync(staticPath, { recursive: true, force: true });
	});

	it('removes song_artists and song_producers when the song is deleted', () => {
		const artist = createArtist(db, { name: 'Artist' });
		const producer = createProducerWithAliases(db, { name: 'Prod', aliases: [] });
		const songId = createSong(db, {
			name: 'Track',
			filepath: 'uploads/songs/track.mp3',
			artistIds: [artist.id],
			producerIds: [producer.id],
			albumId: null
		}).id;

		const countArtists = () =>
			(db.prepare(`SELECT COUNT(*) AS c FROM song_artists WHERE song_id = ?`).get(songId) as {
				c: number;
			}).c;
		const countProducers = () =>
			(db.prepare(`SELECT COUNT(*) AS c FROM song_producers WHERE song_id = ?`).get(songId) as {
				c: number;
			}).c;

		expect(countArtists()).toBe(1);
		expect(countProducers()).toBe(1);

		deleteSong(db, staticPath, songId);

		expect(countArtists()).toBe(0);
		expect(countProducers()).toBe(0);
	});
});

describe('writeAlbumMetadata', () => {
	it('counts songs whose files cannot be written', async () => {
		const db = new Database(':memory:');
		configureConnection(db);
		migrate(db, MIGRATIONS_DIR);
		const staticPath = mkdtempSync(join(tmpdir(), 'leaks-batch-'));
		try {
			const artist = createArtist(db, { name: 'Artist' });
			const album = createAlbum(db, { name: 'Album', artistIds: [artist.id] });
			const empty = createAlbum(db, { name: 'Empty', artistIds: [artist.id] });
			for (const name of ['one', 'two']) {
				createSong(db, {
					name,
					filepath: `uploads/songs/${name}.mp3`,
					artistIds: [artist.id],
					producerIds: [],
					albumId: album.id
				});
			}

			expect(await writeAlbumMetadata(db, staticPath, album.id)).toEqual({ songsFailed: 2 });
			expect(await writeAlbumMetadata(db, staticPath, empty.id)).toEqual({ songsFailed: 0 });
		} finally {
			db.close();
			rmSync(staticPath, { recursive: true, force: true });
		}
	});
});

describe('deleteAlbumAndClearTags', () => {
	const FIXTURE_FLAC = 'ZkxhQwAAACIAwADAAAALAAAMAfQA8AAABkCfCt/b50DLnNgYijV2HiR2hAAALg0AAABMYXZmNjIuMTIuMTAyAQAAABUAAABlbmNvZGVyPUxhdmY2Mi4xMi4xMDL/+BQIACsAAADpW//4FAgBLAAAAIUj//gUCAIlAAAAMav/+BQIAyIAAABd0//4FAgENwAAANi+//gUCAUwAAAAtMb/+BQIBjkAAAAATv/4FAgHPgAAAGw2//hkCAg/9gAAAKYF';
	let db: Database.Database;
	let staticPath: string;
	let artistId: number;

	beforeEach(() => {
		db = new Database(':memory:');
		configureConnection(db);
		migrate(db, MIGRATIONS_DIR);
		staticPath = mkdtempSync(join(tmpdir(), 'leaks-delete-album-'));
		mkdirSync(join(staticPath, 'uploads', 'songs'), { recursive: true });
		artistId = createArtist(db, { name: 'Band' }).id;
	});

	afterEach(() => {
		rmSync(staticPath, { recursive: true, force: true });
	});

	const seedSong = (albumId: number, file: string) =>
		createSong(db, {
			name: 'Track',
			filepath: `uploads/songs/${file}`,
			artistIds: [artistId],
			producerIds: [],
			albumId,
			trackNumber: 2
		}).id;

	it("removes the album's tags from the file and keeps the song's own", async () => {
		const album = createAlbum(db, { name: 'Gone', artistIds: [artistId], genre: 'Jazz' });
		const songId = seedSong(album.id, 'real.flac');
		const path = join(staticPath, 'uploads', 'songs', 'real.flac');
		writeFileSync(path, Buffer.from(FIXTURE_FLAC, 'base64'));
		await writeAlbumMetadata(db, staticPath, album.id);
		expect(await readMetadata(path)).toMatchObject({ album: 'Gone', genre: 'Jazz', trackNumber: 2 });

		const result = await deleteAlbumAndClearTags(db, staticPath, album.id);

		expect(result).toEqual({ songsFailed: 0 });
		expect(await readMetadata(path)).toMatchObject({
			title: 'Track',
			album: null,
			genre: null,
			trackNumber: null
		});
		expect(db.prepare('SELECT album_id, synced FROM songs WHERE id = ?').get(songId)).toEqual({
			album_id: null,
			synced: 0
		});
	});

	it("reports a song whose file can't be written and still deletes the album", async () => {
		const album = createAlbum(db, { name: 'Gone', artistIds: [artistId] });
		seedSong(album.id, 'missing.flac');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await deleteAlbumAndClearTags(db, staticPath, album.id);
		consoleError.mockRestore();

		expect(result).toEqual({ songsFailed: 1 });
		expect(db.prepare('SELECT COUNT(*) AS c FROM albums').get()).toEqual({ c: 0 });
	});

	it("doesn't clear the file's tags on a normal write", () => {
		const songId = createSong(db, {
			name: 'Track',
			filepath: 'uploads/songs/normal.flac',
			artistIds: [artistId],
			producerIds: []
		}).id;

		const { tags } = buildSongTags(db, staticPath, songId);

		expect(tags).not.toHaveProperty('album');
		expect(tags).not.toHaveProperty('genre');
		expect(tags).not.toHaveProperty('images');
	});
});
