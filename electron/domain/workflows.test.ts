import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { migrate } from '../db/migrate';
import { configureConnection } from '../db/connection';
import { uploadAndExtractMetadata, createSongsWithMetadata } from './workflows';
import { createArtist, findArtistByName } from './artists';
import { createAlbum } from './albums';
import { getSongsReadable } from './songs';
import { readMetadata } from '../metadata';
import type { ExtractedMetadata } from './models';

vi.mock('../metadata', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../metadata')>();
	return { ...actual, readMetadata: vi.fn(actual.readMetadata) };
});

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../migrations');

function emptyMeta(over: Partial<ExtractedMetadata> = {}): ExtractedMetadata {
	return {
		title: null,
		artist: null,
		album: null,
		year: null,
		genre: null,
		trackNumber: null,
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
		configureConnection(db);
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

	async function extractTagged(tags: Partial<ExtractedMetadata>[], albumId: number | null = null) {
		for (const tag of tags) vi.mocked(readMetadata).mockResolvedValueOnce(emptyMeta(tag));
		const files = tags.map((_, i) => ({ filename: `${i}.mp3`, base64Data: '' }));
		return uploadAndExtractMetadata(db, staticPath, files, albumId);
	}

	it('flags unknown artists per file and links albums by name, ignoring case', async () => {
		const artist = createArtist(db, { name: 'Known Artist' });
		const album = createAlbum(db, { name: 'Known Album', artistIds: [artist.id] });

		const result = await extractTagged([
			{ artist: 'known artist', album: 'KNOWN ALBUM' },
			{ artist: 'New One, Known Artist', album: 'Other Album' },
			{ artist: 'New One' }
		]);

		expect(result.unmappedArtists).toEqual(['New One']);
		expect(result.filesData.map((f) => f.hasUnmappedArtists)).toEqual([false, true, true]);
		expect(result.filesData.map((f) => f.albumId)).toEqual([album.id, undefined, undefined]);
	});

	it('does not link files by name when an album was selected', async () => {
		const artist = createArtist(db, { name: 'Known Artist' });
		const selected = createAlbum(db, { name: 'Selected', artistIds: [artist.id] });
		createAlbum(db, { name: 'Tagged', artistIds: [artist.id] });

		const result = await extractTagged([{ album: 'Tagged' }], selected.id);

		expect(result.filesData[0].albumId).toBeUndefined();
	});

	it("inherits artists and artwork from each file's own album", async () => {
		const albums = ['One', 'Two'].map((name) => {
			const artist = createArtist(db, { name: `${name} Artist` });
			const album = createAlbum(db, { name, artistIds: [artist.id] });
			db.prepare('UPDATE albums SET artwork_path = ? WHERE id = ?').run(`uploads/artwork/${name}.jpg`, album.id);
			return album;
		});

		const songs = await createSongsWithMetadata(db, staticPath, {
			filesData: albums.map((album) => ({
				originalFilename: `${album.name}.mp3`,
				filepath: `uploads/songs/${album.name}.mp3`,
				albumId: album.id,
				metadata: emptyMeta(),
				parsedArtists: [],
				hasUnmappedArtists: false
			})),
			artistMapping: {},
			useEmbeddedArtwork: false
		});

		expect(songs.map((s) => s.artworkPath)).toEqual([
			'uploads/artwork/One.jpg',
			'uploads/artwork/Two.jpg'
		]);
		const readable = getSongsReadable(db, 10, 0);
		expect(Object.fromEntries(readable.map((s) => [s.album?.name, s.artist]))).toEqual({
			One: 'One Artist',
			Two: 'Two Artist'
		});
	});
});
