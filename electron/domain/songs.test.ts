import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { migrate } from '../db/migrate';
import { registerLower } from '../db/connection';
import { createArtist } from './artists';
import { createAlbum } from './albums';
import { createSong } from './songs';
import { updateSettings } from './settings';
// buildSongTags is the T032 write-path port of backend/metadata.go buildSongTags.
// It assembles the cross-format tag payload from the DB (mediabunny MetadataTags)
// plus the resolved file path, mirroring the Go (SongTags, fullPath, error) return.
import { buildSongTags } from './songs';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../backend/migrations');

// FR-009 — single vs. album track-number rule (oracle: backend/metadata.go buildSongTags).
//   no album + automaticallyMakeSingles  -> album "<name> - Single", trackNumber 1, tracksTotal 1
//   no album + !automaticallyMakeSingles -> no track number emitted
//   has album                            -> trackNumber/<album song count>
describe('buildSongTags single-vs-album track-number rule (FR-009)', () => {
	let db: Database.Database;
	let staticPath: string;

	beforeEach(() => {
		db = new Database(':memory:');
		registerLower(db);
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
