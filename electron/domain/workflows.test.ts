import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { migrate } from '../db/migrate';
import { configureConnection } from '../db/connection';
import { uploadAndExtractMetadata, createSongsWithMetadata, downloadSourceSongs } from './workflows';
import { createArtist, findArtistByName } from './artists';
import { createAlbum } from './albums';
import { createProducerWithAliases } from './producers';
import { getSongsReadable } from './songs';
import { readMetadata } from '../metadata';
import type { ExtractedMetadata, SourceSong } from './models';
import type { SongSource } from '../sources/song-source';

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

	describe('downloadSourceSongs', () => {
		const sourceSong = (over: Partial<SourceSong> = {}): SourceSong => ({
			sourceId: 'fake',
			id: '1',
			name: 'Catalog Title',
			alternateTitles: [],
			artists: ['Catalog Artist'],
			producers: [],
			album: null,
			year: 2018,
			duration: 200,
			artworkUrl: null,
			downloadable: true,
			details: [],
			...over
		});

		const sourceWith = (downloadSong: SongSource['downloadSong']): SongSource => ({
			id: 'fake',
			name: 'Fake',
			imageOrigins: [],
			getFilters: async () => [],
			browse: async () => ({ songs: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false }),
			downloadSong
		});

		const bytes = (text: string) => new Blob([text]).stream();

		it('saves the file and prefers catalog fields over tags, except for duration', async () => {
			vi.mocked(readMetadata).mockResolvedValueOnce(
				emptyMeta({ title: 'Tag Title', artist: 'Tag Artist', genre: 'Rap', duration: 123.4 })
			);
			const source = sourceWith(async () => ({
				song: sourceSong(),
				filename: 'song.mp3',
				size: 5,
				body: bytes('audio')
			}));

			const result = await downloadSourceSongs(db, staticPath, source, ['1'], null);

			expect(result.failures).toEqual([]);
			expect(result.unmappedArtists).toEqual(['Catalog Artist']);
			const [draft] = result.filesData;
			expect(readFileSync(join(staticPath, draft.filepath), 'utf8')).toBe('audio');
			expect(draft.metadata).toMatchObject({
				title: 'Catalog Title',
				artist: 'Catalog Artist',
				year: 2018,
				genre: 'Rap',
				duration: 123.4
			});
		});

		it('reports a failed song, removes its partial file, and keeps the rest', async () => {
			const source = sourceWith(async (songId) => {
				if (songId === 'missing') throw new Error('no file');
				if (songId === 'good') {
					return { song: sourceSong(), filename: 'good.mp3', size: 5, body: bytes('audio') };
				}
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('partial'));
						controller.error(new Error('connection lost'));
					}
				});
				return { song: sourceSong(), filename: 'cut.mp3', size: 99, body };
			});

			const result = await downloadSourceSongs(
				db,
				staticPath,
				source,
				['missing', 'cut', 'good'],
				null
			);

			expect(result.failures).toEqual([
				{ songId: 'missing', error: 'no file' },
				{ songId: 'cut', error: 'connection lost' }
			]);
			expect(result.filesData.map((f) => f.originalFilename)).toEqual(['good.mp3']);
			const onDisk = readdirSync(join(staticPath, 'uploads', 'songs'));
			expect(onDisk).toHaveLength(1);
			expect(onDisk[0]).toMatch(/good\.mp3$/);
		});

		it('reports song and byte progress for the batch', async () => {
			const source = sourceWith(async (songId) => ({
				song: sourceSong({ name: `Song ${songId}` }),
				filename: `${songId}.mp3`,
				size: 5,
				body: bytes('audio')
			}));
			const onProgress = vi.fn();

			await downloadSourceSongs(db, staticPath, source, ['a', 'b'], null, { onProgress });

			const idle = { songName: null, bytesDownloaded: 0, bytesTotal: null };
			const named = (songId: string) => ({
				songId,
				songName: `Song ${songId}`,
				bytesDownloaded: 0,
				bytesTotal: 5
			});
			expect(onProgress.mock.calls.map(([p]) => p)).toEqual([
				{ completedSongs: 0, totalSongs: 2, songId: 'a', ...idle },
				{ completedSongs: 0, totalSongs: 2, ...named('a') },
				{ completedSongs: 1, totalSongs: 2, songId: null, ...idle },
				{ completedSongs: 1, totalSongs: 2, songId: 'b', ...idle },
				{ completedSongs: 1, totalSongs: 2, ...named('b') },
				{ completedSongs: 2, totalSongs: 2, songId: null, ...idle }
			]);
		});

		it('limits byte progress reports during a transfer', async () => {
			vi.useFakeTimers({ toFake: ['Date'] });
			try {
				let chunks = 0;
				const body = new ReadableStream<Uint8Array>({
					pull(controller) {
						// 10 chunks per report interval, 100 chunks in total.
						vi.setSystemTime(Date.now() + 20);
						controller.enqueue(new Uint8Array(1));
						if (++chunks === 100) controller.close();
					}
				});
				const source = sourceWith(async () => ({
					song: sourceSong(),
					filename: 'song.mp3',
					size: 100,
					body
				}));
				const onProgress = vi.fn();

				await downloadSourceSongs(db, staticPath, source, ['1'], null, { onProgress });

				const reported = onProgress.mock.calls
					.map(([p]) => p.bytesDownloaded)
					.filter((n) => n > 0);
				expect(reported.length).toBeGreaterThan(5);
				expect(reported.length).toBeLessThan(15);
				expect(reported).toEqual([...reported].sort((a, b) => a - b));
			} finally {
				vi.useRealTimers();
			}
		});

		it('on cancel, removes the partial file, skips the rest, and keeps finished songs', async () => {
			const controller = new AbortController();
			const requested: string[] = [];
			const source = sourceWith(async (songId, signal) => {
				requested.push(songId);
				if (songId === 'done') {
					return { song: sourceSong(), filename: 'done.mp3', size: 5, body: bytes('audio') };
				}
				const body = new ReadableStream<Uint8Array>({
					start(stream) {
						stream.enqueue(new TextEncoder().encode('partial'));
						signal?.addEventListener('abort', () => stream.error(signal.reason));
						controller.abort();
					}
				});
				return { song: sourceSong(), filename: 'cut.mp3', size: 99, body };
			});

			const result = await downloadSourceSongs(
				db,
				staticPath,
				source,
				['done', 'cut', 'never'],
				null,
				{ signal: controller.signal }
			);

			expect(result.cancelled).toBe(true);
			expect(result.failures).toEqual([]);
			expect(requested).toEqual(['done', 'cut']);
			expect(result.filesData.map((f) => f.originalFilename)).toEqual(['done.mp3']);
			const onDisk = readdirSync(join(staticPath, 'uploads', 'songs'));
			expect(onDisk).toHaveLength(1);
			expect(onDisk[0]).toMatch(/done\.mp3$/);
		});

		it('links credited producers when the drafts are imported', async () => {
			const knight = createProducerWithAliases(db, { name: 'J. Knight', aliases: [] });
			createProducerWithAliases(db, { name: 'Not Credited', aliases: [] });
			const source = sourceWith(async () => ({
				song: sourceSong({ producers: ['J. Knight', 'Stranger'] }),
				filename: 'song.mp3',
				size: 5,
				body: bytes('audio')
			}));

			const { filesData } = await downloadSourceSongs(db, staticPath, source, ['1'], null);
			await createSongsWithMetadata(db, staticPath, {
				filesData,
				artistMapping: { 'Catalog Artist': 'CREATE_NEW' },
				useEmbeddedArtwork: false
			});

			const [song] = getSongsReadable(db, 10, 0);
			expect(song.name).toBe('Catalog Title');
			expect(song.artist).toBe('Catalog Artist');
			expect(song.producers.map((p) => p.id)).toEqual([knight.id]);
		});
	});
});
