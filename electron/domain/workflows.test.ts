import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { migrate } from '../db/migrate';
import { registerLower } from '../db/connection';
import { uploadAndExtractMetadata, createSongsWithMetadata } from './workflows';
import { createArtist, findArtistByName } from './artists';
import { createAlbum } from './albums';
import { getSongsReadable } from './songs';
import type { ExtractedMetadata } from '../metadata';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../backend/migrations');

function emptyMeta(over: Partial<ExtractedMetadata> = {}): ExtractedMetadata {
	return {
		title: null,
		artist: null,
		albumArtist: null,
		album: null,
		year: null,
		genre: null,
		trackNumber: null,
		producer: null,
		duration: null,
		artwork: null,
		...over
	};
}

describe('workflows', () => {
	let db: Database.Database;
	let staticPath: string;

	beforeEach(() => {
		db = new Database(':memory:');
		registerLower(db);
		migrate(db, MIGRATIONS_DIR);
		staticPath = mkdtempSync(join(tmpdir(), 'leaks-wf-'));
		mkdirSync(join(staticPath, 'uploads', 'songs'), { recursive: true });
		mkdirSync(join(staticPath, 'uploads', 'artwork'), { recursive: true });
	});

	afterEach(() => {
		rmSync(staticPath, { recursive: true, force: true });
	});

	// Mirror: TestUploadAndExtractMetadataKeepsUnreadableFilesInWorkflow
	it('keeps unreadable files with empty metadata and saves them to disk', async () => {
		const result = await uploadAndExtractMetadata(
			db,
			staticPath,
			[{ filename: 'demo.txt', base64Data: Buffer.from('not audio metadata').toString('base64') }],
			null
		);

		expect(result.filesData).toHaveLength(1);
		expect(result.filesData[0].metadata.title).toBeNull();
		expect(result.filesWithArtwork).toBe(0);
		expect(existsSync(join(staticPath, result.filesData[0].filepath))).toBe(true);
	});

	// Mirror: TestCreateSongsWithMetadataCreatesArtistsAndInheritsAlbumArtwork
	it('creates CREATE_NEW artists, inherits album artwork, preserves fields, links in order', async () => {
		const existing = createArtist(db, { name: 'Existing Artist' });
		const album = createAlbum(db, { name: 'Inherited Album', artistIds: [existing.id] });

		const artworkPath = 'uploads/artwork/inherited.jpg';
		db.prepare('UPDATE albums SET artwork_path = ? WHERE id = ?').run(artworkPath, album.id);

		const songs = await createSongsWithMetadata(db, staticPath, {
			albumId: album.id,
			filesData: [
				{
					originalFilename: 'seed.mp3',
					filepath: 'uploads/songs/seed.mp3',
					albumId: album.id,
					metadata: emptyMeta({
						title: 'Imported Song',
						genre: 'Rap',
						year: 2024,
						trackNumber: 2,
						duration: 184.5
					}),
					parsedArtists: ['Existing Artist', 'New Artist'],
					hasUnmappedArtists: true
				}
			],
			artistMapping: { 'New Artist': 'CREATE_NEW' },
			useEmbeddedArtwork: false
		});

		expect(songs).toHaveLength(1);
		expect(songs[0].artworkPath).toBe(artworkPath);
		expect(songs[0].trackNumber).toBe(2);

		expect(findArtistByName(db, 'New Artist')).not.toBeNull();

		const readable = getSongsReadable(db, 10, 0);
		expect(readable).toHaveLength(1);
		expect(readable[0].artist).toBe('Existing Artist, New Artist');
		expect(readable[0].album?.name).toBe('Inherited Album');
	});
});
