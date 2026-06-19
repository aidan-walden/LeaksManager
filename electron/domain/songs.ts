import type Database from 'better-sqlite3';
import type {
	Song,
	SongReadable,
	Artist,
	Producer,
	Album,
	CreateSongInput,
	UpdateSongInput
} from './models';
import type { SongProcessingResult, BatchResult } from './models';
import { rowToSong, rowToArtist, rowToProducer, rowToAlbum, now } from './rows';
import { resolveOrCreateAlbum } from './albums';
import { getSettings } from './settings';
import { staticFilePath } from '../paths';
import { writeMetadata, type MetadataTags } from '../metadata';
import { readFileSync, rmSync } from 'node:fs';

// Port of backend/songs.go — create + read paths plus update/delete (US2).

const SONG_COLS =
	'id, name, album_id, artwork_path, genre, year, track_number, duration, filepath, file_type, created_at, updated_at, synced, apple_music_id';

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

		const linkArtist = tx.prepare(
			`INSERT INTO song_artists (song_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`
		);
		input.artistIds.forEach((artistId, i) => linkArtist.run(songId, artistId, i, ts));

		const linkProducer = tx.prepare(
			`INSERT INTO song_producers (song_id, producer_id, "order", created_at) VALUES (?, ?, ?, ?)`
		);
		input.producerIds.forEach((producerId, i) => linkProducer.run(songId, producerId, i, ts));

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

export function updateSong(db: Database.Database, input: UpdateSongInput): SongReadable | null {
	const ts = now();

	let albumId = input.albumId ?? null;
	if (input.albumName != null) {
		const { album } = resolveOrCreateAlbum(db, input.albumName, input.artistIds, {
			isSingle: input.isSingle,
			inheritArtworkFromSongId: input.id
		});
		albumId = album ? album.id : null;
	}

	db.transaction((tx) => {
		tx.prepare(
			`UPDATE songs SET name = COALESCE(?, name), album_id = ?, track_number = ?, updated_at = ? WHERE id = ?`
		).run(input.name ?? null, albumId, input.trackNumber ?? null, ts, input.id);

		if (input.artistIds != null) {
			tx.prepare(`DELETE FROM song_artists WHERE song_id = ?`).run(input.id);
			const linkArtist = tx.prepare(
				`INSERT INTO song_artists (song_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`
			);
			input.artistIds.forEach((artistId, i) => linkArtist.run(input.id, artistId, i, ts));
		}

		if (input.producerIds != null) {
			tx.prepare(`DELETE FROM song_producers WHERE song_id = ?`).run(input.id);
			const linkProducer = tx.prepare(
				`INSERT INTO song_producers (song_id, producer_id, "order", created_at) VALUES (?, ?, ?, ?)`
			);
			input.producerIds.forEach((producerId, i) => linkProducer.run(input.id, producerId, i, ts));
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
		try {
			rmSync(staticFilePath(staticPath, songFilepath));
		} catch {
			// ignore — Go swallows the path/remove error
		}
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
			`SELECT ar.id, ar.name, ar.image, ar.career_start_year, ar.career_end_year, ar.created_at, ar.updated_at, ar.synced
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

export function getAlbumById(db: Database.Database, albumId: number): Album | null {
	const row = db
		.prepare(
			`SELECT id, name, artwork_path, genre, year, is_single, created_at, updated_at, synced FROM albums WHERE id = ?`
		)
		.get(albumId) as Record<string, unknown> | undefined;
	return row ? rowToAlbum(row) : null;
}

// --- Metadata write-back (port of backend/metadata.go) ---

// buildSongTags assembles a mediabunny MetadataTags payload from the DB, mirroring
// backend/metadata.go buildSongTags: genre/album-artist fall back song→album, artwork
// falls back song→album, and the singles/track-number rule (FR-009) is driven by
// Settings. Returns the tags plus the resolved full path of the audio file to write.
// ponytail: mediabunny's MetadataTags has no composer/producer field, so producers
// (the Go oracle wrote them as composer) are not emitted by the unified engine.
export function buildSongTags(
	db: Database.Database,
	staticPath: string,
	songId: number
): { tags: MetadataTags; fullPath: string } {
	const row = db
		.prepare(
			`SELECT
				s.name AS s_name, s.filepath AS s_filepath, s.genre AS s_genre, s.year AS s_year,
				s.track_number AS s_track, s.artwork_path AS s_artwork,
				a.name AS a_name, a.genre AS a_genre, a.artwork_path AS a_artwork,
				(SELECT GROUP_CONCAT(ar.name, ', ') FROM song_artists sa
				 LEFT JOIN artists ar ON sa.artist_id = ar.id
				 WHERE sa.song_id = s.id ORDER BY sa."order") AS artists,
				(SELECT GROUP_CONCAT(ar2.name, ', ') FROM album_artists aa
				 LEFT JOIN artists ar2 ON aa.artist_id = ar2.id
				 WHERE aa.album_id = s.album_id ORDER BY aa."order") AS album_artists
			FROM songs s
			LEFT JOIN albums a ON s.album_id = a.id
			WHERE s.id = ?`
		)
		.get(songId) as Record<string, unknown> | undefined;

	if (!row) throw new Error('song not found');

	const str = (v: unknown): string => (v == null ? '' : String(v));
	const num = (v: unknown): number => (v == null ? 0 : Number(v));

	const sName = str(row.s_name);
	const fullPath = staticFilePath(staticPath, str(row.s_filepath));

	let genre = str(row.s_genre);
	if (genre === '') genre = str(row.a_genre);

	let albumName = str(row.a_name);
	const artistStr = str(row.artists);
	let albumArtist = str(row.album_artists);
	if (albumArtist === '') albumArtist = artistStr;

	const year = num(row.s_year);
	let trackNumber = num(row.s_track);
	let trackTotal = 0;

	const settings = getSettings(db);
	if (albumName === '') {
		if (settings.automaticallyMakeSingles) {
			albumName = `${sName} - Single`;
			trackNumber = 1;
			trackTotal = 1;
		} else {
			trackNumber = 0;
		}
	} else {
		const count = db
			.prepare(
				`SELECT COUNT(*) AS c FROM songs
				 WHERE album_id = (SELECT album_id FROM songs WHERE id = ?)`
			)
			.get(songId) as { c: number };
		trackTotal = count.c;
	}

	// artwork: song art preferred, fall back to album art
	const artRel = str(row.s_artwork) || str(row.a_artwork);

	const tags: MetadataTags = {};
	if (sName !== '') tags.title = sName;
	if (artistStr !== '') tags.artist = artistStr;
	if (albumArtist !== '') tags.albumArtist = albumArtist;
	if (albumName !== '') tags.album = albumName;
	if (genre !== '') tags.genre = genre;
	// Go wrote year as `date=YYYY`; readMetadata derives the year from date.getFullYear().
	// Use a local mid-year date so the round-tripped year is timezone-stable.
	if (year > 0) tags.date = new Date(year, 5, 15);
	if (trackNumber > 0) {
		tags.trackNumber = trackNumber;
		if (trackTotal > 0) tags.tracksTotal = trackTotal;
	}

	if (artRel !== '') {
		const artFull = staticFilePath(staticPath, artRel);
		const mimeType = artRel.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
		tags.images = [
			{ data: new Uint8Array(readFileSync(artFull)), mimeType, kind: 'coverFront' }
		];
	}

	return { tags, fullPath };
}

async function writeSongMetadataInternal(
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

// WriteAlbumMetadata writes tags to every song in an album.
export async function writeAlbumMetadata(
	db: Database.Database,
	staticPath: string,
	albumId: number
): Promise<BatchResult> {
	const rows = db.prepare(`SELECT id FROM songs WHERE album_id = ?`).all(albumId) as {
		id: number;
	}[];

	const results = await Promise.all(
		rows.map((r) => writeSongMetadata(db, staticPath, r.id))
	);

	const songsProcessed = results.filter((r) => r.success).length;
	const songsFailed = results.length - songsProcessed;
	return {
		success: true,
		message: `Processed album ${albumId}`,
		songsProcessed,
		songsFailed,
		results
	};
}
