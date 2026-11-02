import type Database from 'better-sqlite3';
import type {
	Song,
	SongReadable,
	Artist,
	Producer,
	CreateSongInput,
	UpdateSongInput
} from './models';
import type { SongProcessingResult, BatchResult } from './models';
import { ARTIST_COLS, SONG_COLS, qualify, rowToSong, rowToArtist, rowToProducer, now } from './rows';
import { linkOrdered, replaceOrderedLinks } from './links';
import { getAlbumById, getArtistsForAlbum, resolveOrCreateAlbum } from './albums';
import { getSettings } from './settings';
import { cleanupFiles } from '../files';
import { staticFilePath } from '../paths';
import { writeMetadata, type MetadataTags } from '../metadata';
import { readFileSync } from 'node:fs';

// Port of backend/songs.go — create + read paths plus update/delete (US2).

// Each write holds the cover art in memory and re-muxes a whole audio file, so a large
// album or producer must not start them all at once.
const METADATA_WRITE_CONCURRENCY = 4;

export function createSong(db: Database.Database, input: CreateSongInput): Song {
	const ts = now();
	return db.transaction((tx) => {
		const info = tx
			.prepare(
				`INSERT INTO songs (name, filepath, album_id, artwork_path, genre, year, track_number, duration, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				input.name,
				input.filepath,
				input.albumId ?? null,
				input.artworkPath ?? null,
				input.genre ?? null,
				input.year ?? null,
				input.trackNumber ?? null,
				input.duration ?? null,
				ts,
				ts
			);
		const songId = Number(info.lastInsertRowid);

		linkOrdered(tx, 'song_artists', songId, input.artistIds, ts);
		linkOrdered(tx, 'song_producers', songId, input.producerIds, ts);

		return {
			id: songId,
			name: input.name,
			albumId: input.albumId ?? null,
			artworkPath: input.artworkPath ?? null,
			genre: input.genre ?? null,
			year: input.year ?? null,
			trackNumber: input.trackNumber ?? null,
			duration: input.duration ?? null,
			filepath: input.filepath,
			fileType: null,
			createdAt: ts,
			updatedAt: ts,
			synced: false
		};
	})(db);
}

export function getSongById(db: Database.Database, songId: number): Song | null {
	const row = db.prepare(`SELECT ${SONG_COLS} FROM songs WHERE id = ?`).get(songId) as
		| Record<string, unknown>
		| undefined;
	return row ? rowToSong(row) : null;
}

export function getSongReadable(db: Database.Database, songId: number): SongReadable | null {
	const song = getSongById(db, songId);
	return song ? buildSongReadable(db, song) : null;
}

// updateSong performs a FULL-STATE replace, not a partial patch: `album_id` and
// `track_number` are written from the input every time, so an omitted field is
// interpreted as "clear it" (→ NULL), not "leave unchanged". The edit UI relies on this
// to clear a track number or unassign an album. Any new caller must therefore send the
// song's complete intended state, not a sparse diff.
export function updateSong(db: Database.Database, input: UpdateSongInput): SongReadable | null {
	const ts = now();

	let albumId = input.albumId ?? null;
	if (input.albumName != null) {
		const album = resolveOrCreateAlbum(db, input.albumName, input.artistIds, {
			isSingle: input.isSingle,
			inheritArtworkFromSongId: input.id
		});
		albumId = album?.id ?? null;
	}

	db.transaction((tx) => {
		tx.prepare(
			`UPDATE songs SET name = COALESCE(?, name), album_id = ?, track_number = ?, updated_at = ? WHERE id = ?`
		).run(input.name ?? null, albumId, input.trackNumber ?? null, ts, input.id);

		if (input.artistIds != null) {
			replaceOrderedLinks(tx, 'song_artists', input.id, input.artistIds, ts);
		}

		if (input.producerIds != null) {
			replaceOrderedLinks(tx, 'song_producers', input.id, input.producerIds, ts);
		}
	})(db);

	return getSongReadable(db, input.id);
}

export function deleteSong(db: Database.Database, staticPath: string, songId: number): void {
	let songFilepath = '';
	db.transaction((tx) => {
		const row = tx.prepare(`SELECT filepath FROM songs WHERE id = ?`).get(songId) as
			| { filepath: string }
			| undefined;
		if (!row) throw new Error(`song ${songId} not found`);
		songFilepath = row.filepath;
		tx.prepare(`DELETE FROM songs WHERE id = ?`).run(songId);
	})(db);

	// Delete file from disk (best-effort, mirror Go)
	if (songFilepath !== '') {
		cleanupFiles(staticPath, [songFilepath]);
	}
}

export function getSongsReadable(
	db: Database.Database,
	limit: number,
	offset: number
): SongReadable[] {
	const rows = db
		.prepare(`SELECT ${SONG_COLS} FROM songs ORDER BY created_at DESC LIMIT ? OFFSET ?`)
		.all(limit, offset) as Record<string, unknown>[];
	return rows.map((r) => buildSongReadable(db, rowToSong(r)));
}

export function getSongsCount(db: Database.Database): number {
	return (db.prepare(`SELECT COUNT(*) AS c FROM songs`).get() as { c: number }).c;
}

export function buildSongReadable(db: Database.Database, song: Song): SongReadable {
	const artists = getArtistsForSong(db, song.id);
	const producers = getProducersForSong(db, song.id);
	const album = song.albumId != null ? getAlbumById(db, song.albumId) : null;
	return {
		...song,
		artist: artists.map((a) => a.name).join(', '),
		artists,
		producers,
		album
	};
}

export function getArtistsForSong(db: Database.Database, songId: number): Artist[] {
	const rows = db
		.prepare(
			`SELECT ${qualify(ARTIST_COLS, 'ar')}
			 FROM artists ar
			 JOIN song_artists sa ON ar.id = sa.artist_id
			 WHERE sa.song_id = ?
			 ORDER BY sa."order"`
		)
		.all(songId) as Record<string, unknown>[];
	return rows.map(rowToArtist);
}

export function getProducersForSong(db: Database.Database, songId: number): Producer[] {
	const rows = db
		.prepare(
			`SELECT p.id, p.name, p.created_at, p.updated_at
			 FROM producers p
			 JOIN song_producers sp ON p.id = sp.producer_id
			 WHERE sp.song_id = ?
			 ORDER BY sp."order"`
		)
		.all(songId) as Record<string, unknown>[];
	return rows.map(rowToProducer);
}

// --- Metadata write-back (port of backend/metadata.go) ---

// buildSongTags assembles a mediabunny MetadataTags payload from the DB: genre and
// album artist fall back song→album, artwork falls back song→album, and the singles
// track-number rule is driven by Settings. Returns the tags plus the resolved full path
// of the audio file to write.
export function buildSongTags(
	db: Database.Database,
	staticPath: string,
	songId: number
): { tags: MetadataTags; fullPath: string } {
	const song = getSongReadable(db, songId);
	if (!song) throw new Error('song not found');

	const album = song.album;
	const fullPath = staticFilePath(staticPath, song.filepath);
	const genre = song.genre || album?.genre;
	const albumArtists = album ? getArtistsForAlbum(db, album.id) : [];
	const albumArtist = albumArtists.map((a) => a.name).join(', ') || song.artist;

	let albumName = album?.name ?? '';
	let trackNumber = song.trackNumber ?? 0;
	let trackTotal = 0;

	if (album && albumName !== '') {
		const count = db.prepare(`SELECT COUNT(*) AS c FROM songs WHERE album_id = ?`).get(album.id) as {
			c: number;
		};
		trackTotal = count.c;
	} else if (getSettings(db).automaticallyMakeSingles) {
		albumName = `${song.name} - Single`;
		trackNumber = 1;
		trackTotal = 1;
	} else {
		trackNumber = 0;
	}

	const tags: MetadataTags = {};
	if (song.name !== '') tags.title = song.name;
	if (song.artist !== '') tags.artist = song.artist;
	if (albumArtist !== '') tags.albumArtist = albumArtist;
	if (albumName !== '') tags.album = albumName;
	if (genre) tags.genre = genre;
	// readMetadata derives the year from date.getFullYear(), so use a local mid-year date
	// to keep the round-tripped year timezone-stable.
	if ((song.year ?? 0) > 0) tags.date = new Date(song.year as number, 5, 15);
	if (trackNumber > 0) {
		tags.trackNumber = trackNumber;
		if (trackTotal > 0) tags.tracksTotal = trackTotal;
	}

	const artwork = song.artworkPath || album?.artworkPath;
	if (artwork) {
		const artFull = staticFilePath(staticPath, artwork);
		const mimeType = artwork.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
		tags.images = [
			{ data: new Uint8Array(readFileSync(artFull)), mimeType, kind: 'coverFront' }
		];
	}

	// MetadataTags has no composer/producer field. Emit the names via `raw` under all three
	// format-native keys (ID3 TCOM, MP4 ©wrt, Vorbis PRODUCER); mediabunny writes only the
	// key that matches the output format.
	const producers = song.producers.map((p) => p.name).join(', ');
	if (producers !== '') {
		tags.raw = { TCOM: producers, '©wrt': producers, PRODUCER: producers };
	}

	return { tags, fullPath };
}

export async function writeSongMetadataInternal(
	db: Database.Database,
	staticPath: string,
	songId: number
): Promise<void> {
	const { tags, fullPath } = buildSongTags(db, staticPath, songId);
	await writeMetadata(fullPath, tags);
}

// WriteSongMetadata writes the assembled tags back into the song's file. Mirrors the
// Go oracle: failures are returned as a result, not thrown.
export async function writeSongMetadata(
	db: Database.Database,
	staticPath: string,
	songId: number
): Promise<SongProcessingResult> {
	try {
		await writeSongMetadataInternal(db, staticPath, songId);
		return { songId, success: true };
	} catch (err) {
		return { songId, success: false, error: err instanceof Error ? err.message : String(err) };
	}
}

// Writes tags to each song, aggregating the per-song results.
export async function writeSongsMetadata(
	db: Database.Database,
	staticPath: string,
	songIds: number[],
	message: string
): Promise<BatchResult> {
	const results: SongProcessingResult[] = new Array(songIds.length);
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min(METADATA_WRITE_CONCURRENCY, songIds.length) },
		async () => {
			while (cursor < songIds.length) {
				const index = cursor++;
				results[index] = await writeSongMetadata(db, staticPath, songIds[index]);
			}
		}
	);
	await Promise.all(workers);

	const songsProcessed = results.filter((r) => r.success).length;
	const songsFailed = results.length - songsProcessed;
	return { success: songsFailed === 0, message, songsProcessed, songsFailed, results };
}

// WriteAlbumMetadata writes tags to every song in an album.
export async function writeAlbumMetadata(
	db: Database.Database,
	staticPath: string,
	albumId: number
): Promise<BatchResult> {
	const rows = db.prepare(`SELECT id FROM songs WHERE album_id = ?`).all(albumId) as {
		id: number;
	}[];
	return writeSongsMetadata(
		db,
		staticPath,
		rows.map((r) => r.id),
		`Processed album ${albumId}`
	);
}
