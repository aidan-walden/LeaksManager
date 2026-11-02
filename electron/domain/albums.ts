import type Database from 'better-sqlite3';
import type {
	Album,
	AlbumWithArtists,
	AlbumWithSongs,
	Artist,
	Song,
	CreateAlbumInput,
	UpdateAlbumInput,
	AlbumResolutionOpts
} from './models';
import { ALBUM_COLS, ARTIST_COLS, SONG_COLS, qualify, rowToAlbum, rowToArtist, rowToSong, now } from './rows';
import { linkOrdered, replaceOrderedLinks } from './links';
import { saveBase64 } from '../files';

// Port of backend/albums.go (+ UploadAlbumArt from files.go).

function insertAlbumWithArtists(
	tx: Database.Database,
	fields: Pick<Album, 'name' | 'artworkPath' | 'genre' | 'year' | 'isSingle'>,
	artistIds: number[],
	ts: number
): Album {
	if (artistIds.length === 0) {
		throw new Error('album must have at least one artist');
	}
	const info = tx
		.prepare(
			`INSERT INTO albums (name, artwork_path, genre, year, is_single, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		// better-sqlite3 rejects JS booleans — bind as 0/1.
		.run(fields.name, fields.artworkPath, fields.genre, fields.year, fields.isSingle ? 1 : 0, ts, ts);
	const albumId = Number(info.lastInsertRowid);
	linkOrdered(tx, 'album_artists', albumId, artistIds, ts);
	return { id: albumId, ...fields, createdAt: ts, updatedAt: ts, synced: false };
}

export function createAlbum(db: Database.Database, input: CreateAlbumInput): Album {
	const ts = now();
	return db.transaction((tx) =>
		insertAlbumWithArtists(
			tx,
			{
				name: input.name,
				artworkPath: null,
				genre: input.genre ?? null,
				year: input.year ?? null,
				isSingle: input.isSingle ?? false
			},
			input.artistIds,
			ts
		)
	)(db);
}

export function updateAlbum(db: Database.Database, input: UpdateAlbumInput): void {
	const ts = now();
	db.transaction((tx) => {
		tx.prepare(
			`UPDATE albums SET name = COALESCE(?, name), genre = ?, year = ?, updated_at = ? WHERE id = ?`
		).run(input.name ?? null, input.genre ?? null, input.year ?? null, ts, input.id);

		if (input.artistIds.length > 0) {
			replaceOrderedLinks(tx, 'album_artists', input.id, input.artistIds, ts);
		}
	})(db);
}

export function deleteAlbum(db: Database.Database, albumId: number): void {
	db.transaction((tx) => {
		// Unlink songs (album_id → NULL), then drop artist links and the album.
		tx.prepare(`UPDATE songs SET album_id = NULL WHERE album_id = ?`).run(albumId);
		tx.prepare(`DELETE FROM album_artists WHERE album_id = ?`).run(albumId);
		tx.prepare(`DELETE FROM albums WHERE id = ?`).run(albumId);
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

export function getAlbumById(db: Database.Database, albumId: number): Album | null {
	const row = db.prepare(`SELECT ${ALBUM_COLS} FROM albums WHERE id = ?`).get(albumId) as
		| Record<string, unknown>
		| undefined;
	return row ? rowToAlbum(row) : null;
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
			`SELECT ${qualify(ARTIST_COLS, 'ar')}
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

		let artworkPath: string | null = null;
		if (opts.inheritArtworkFromSongId != null) {
			const songRow = tx
				.prepare(`SELECT artwork_path FROM songs WHERE id = ?`)
				.get(opts.inheritArtworkFromSongId) as { artwork_path: string | null } | undefined;
			artworkPath = songRow?.artwork_path ?? null;
		}

		return {
			album: insertAlbumWithArtists(
				tx,
				{ name: trimmed, artworkPath, genre: null, year: null, isSingle: opts.isSingle ?? false },
				artistIds,
				ts
			),
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
