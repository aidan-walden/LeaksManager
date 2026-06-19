import type Database from 'better-sqlite3';
import type {
	Album,
	AlbumWithArtists,
	AlbumWithSongs,
	Artist,
	Song,
	CreateAlbumInput,
	AlbumResolutionOpts
} from './models';
import { rowToAlbum, rowToArtist, rowToSong, now } from './rows';
import { saveBase64 } from '../files';

// Port of backend/albums.go (+ UploadAlbumArt from files.go). update/delete are US2.

const ALBUM_COLS =
	'id, name, artwork_path, genre, year, is_single, created_at, updated_at, synced';
const SONG_COLS =
	'id, name, album_id, artwork_path, genre, year, track_number, duration, filepath, file_type, created_at, updated_at, synced, apple_music_id';

// better-sqlite3 rejects JS booleans — bind as 0/1.
const b = (v: boolean | undefined): number => (v ? 1 : 0);

export function createAlbum(db: Database.Database, input: CreateAlbumInput): Album {
	if (input.artistIds.length === 0) {
		throw new Error('album must have at least one artist');
	}
	const ts = now();
	return db.transaction((tx) => {
		const info = tx
			.prepare(
				`INSERT INTO albums (name, genre, year, is_single, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
			)
			.run(input.name, input.genre ?? null, input.year ?? null, b(input.isSingle), ts, ts);
		const albumId = Number(info.lastInsertRowid);
		const link = tx.prepare(
			`INSERT INTO album_artists (album_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`
		);
		input.artistIds.forEach((artistId, i) => link.run(albumId, artistId, i, ts));
		return {
			id: albumId,
			name: input.name,
			artworkPath: null,
			genre: input.genre ?? null,
			year: input.year ?? null,
			isSingle: input.isSingle ?? false,
			createdAt: ts,
			updatedAt: ts,
			synced: false
		};
	})(db);
}

export function getAlbumsWithSongs(
	db: Database.Database,
	limit: number,
	offset: number
): AlbumWithSongs[] {
	const rows = db
		.prepare(`SELECT ${ALBUM_COLS} FROM albums ORDER BY created_at DESC LIMIT ? OFFSET ?`)
		.all(limit, offset) as Record<string, unknown>[];
	return rows.map((r) => {
		const alb = rowToAlbum(r);
		return { ...alb, artists: getArtistsForAlbum(db, alb.id), songs: getSongsForAlbum(db, alb.id) };
	});
}

export function getAlbumWithArtists(
	db: Database.Database,
	albumId: number
): AlbumWithArtists | null {
	const row = db.prepare(`SELECT ${ALBUM_COLS} FROM albums WHERE id = ?`).get(albumId) as
		| Record<string, unknown>
		| undefined;
	if (!row) return null;
	return { ...rowToAlbum(row), artists: getArtistsForAlbum(db, albumId) };
}

export function getArtistsForAlbum(db: Database.Database, albumId: number): Artist[] {
	const rows = db
		.prepare(
			`SELECT ar.id, ar.name, ar.image, ar.career_start_year, ar.career_end_year, ar.created_at, ar.updated_at, ar.synced
			 FROM artists ar
			 JOIN album_artists aa ON ar.id = aa.artist_id
			 WHERE aa.album_id = ?
			 ORDER BY aa."order"`
		)
		.all(albumId) as Record<string, unknown>[];
	return rows.map(rowToArtist);
}

export function getSongsForAlbum(db: Database.Database, albumId: number): Song[] {
	const rows = db
		.prepare(`SELECT ${SONG_COLS} FROM songs WHERE album_id = ? ORDER BY track_number, created_at`)
		.all(albumId) as Record<string, unknown>[];
	return rows.map(rowToSong);
}

export function findAlbumByName(db: Database.Database, name: string): Album | null {
	const row = db
		.prepare(`SELECT ${ALBUM_COLS} FROM albums WHERE LOWER(name) = LOWER(?)`)
		.get(name) as Record<string, unknown> | undefined;
	return row ? rowToAlbum(row) : null;
}

// True if the album's ordered artist list equals artistIds exactly.
export function artistSetMatches(
	db: Database.Database,
	albumId: number,
	artistIds: number[]
): boolean {
	const existing = (
		db
			.prepare(`SELECT artist_id FROM album_artists WHERE album_id = ? ORDER BY "order"`)
			.all(albumId) as { artist_id: number }[]
	).map((r) => r.artist_id);
	if (existing.length !== artistIds.length) return false;
	return existing.every((id, i) => id === artistIds[i]);
}

// Finds an album by case-insensitive name with the exact ordered artist set, or
// creates one. Empty trimmed name → { album: null, created: false }.
export function resolveOrCreateAlbum(
	db: Database.Database,
	name: string,
	artistIds: number[],
	opts: AlbumResolutionOpts = {}
): { album: Album | null; created: boolean } {
	const trimmed = name.trim();
	if (trimmed === '') return { album: null, created: false };
	const ts = now();

	return db.transaction((tx) => {
		const candidates = (
			tx
				.prepare(`SELECT ${ALBUM_COLS} FROM albums WHERE LOWER(name) = LOWER(?)`)
				.all(trimmed) as Record<string, unknown>[]
		).map(rowToAlbum);

		for (const alb of candidates) {
			if (artistSetMatches(tx, alb.id, artistIds)) {
				if (opts.isSingle && !alb.isSingle) {
					tx.prepare(`UPDATE albums SET is_single = 1, updated_at = ? WHERE id = ?`).run(ts, alb.id);
					alb.isSingle = true;
					alb.updatedAt = ts;
				}
				return { album: alb, created: false };
			}
		}

		if (artistIds.length === 0) {
			throw new Error('album must have at least one artist');
		}

		let artworkPath: string | null = null;
		if (opts.inheritArtworkFromSongId != null) {
			const songRow = tx
				.prepare(`SELECT artwork_path FROM songs WHERE id = ?`)
				.get(opts.inheritArtworkFromSongId) as { artwork_path: string | null } | undefined;
			artworkPath = songRow?.artwork_path ?? null;
		}

		const info = tx
			.prepare(
				`INSERT INTO albums (name, artwork_path, is_single, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
			)
			.run(trimmed, artworkPath, b(opts.isSingle), ts, ts);
		const newId = Number(info.lastInsertRowid);
		const link = tx.prepare(
			`INSERT INTO album_artists (album_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`
		);
		artistIds.forEach((artistId, i) => link.run(newId, artistId, i, ts));

		return {
			album: {
				id: newId,
				name: trimmed,
				artworkPath,
				genre: null,
				year: null,
				isSingle: opts.isSingle ?? false,
				createdAt: ts,
				updatedAt: ts,
				synced: false
			},
			created: true
		};
	})(db);
}

// Save artwork to disk and point the album at it (port of files.go UploadAlbumArt).
export function uploadAlbumArt(
	db: Database.Database,
	staticPath: string,
	albumId: number,
	filename: string,
	base64Data: string
): void {
	const relPath = saveBase64(staticPath, 'artwork', filename, base64Data);
	db.prepare(`UPDATE albums SET artwork_path = ? WHERE id = ?`).run(relPath, albumId);
}
