import type Database from 'better-sqlite3';
import type {
	Album,
	AlbumWithArtists,
	AlbumSummary,
	Artist,
	CreateAlbumInput,
	UpdateAlbumInput,
	AlbumResolutionOpts
} from './models';
import { ALBUM_COLS, ARTIST_COLS, qualify, rowToAlbum, rowToArtist, now } from './rows';
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

// Foreign keys handle the rest: songs get album_id = NULL, and artist links are deleted.
export function deleteAlbum(db: Database.Database, albumId: number): void {
	db.prepare(`DELETE FROM albums WHERE id = ?`).run(albumId);
}

export function getAlbumSummaries(db: Database.Database): AlbumSummary[] {
	const rows = db
		.prepare(
			`SELECT ${ALBUM_COLS}, (SELECT COUNT(*) FROM songs WHERE album_id = albums.id) AS song_count
			 FROM albums ORDER BY created_at DESC`
		)
		.all() as Record<string, unknown>[];
	return rows.map((r) => {
		const album = rowToAlbum(r);
		return { ...album, artists: getArtistsForAlbum(db, album.id), songCount: Number(r.song_count) };
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
	const album = getAlbumById(db, albumId);
	return album ? { ...album, artists: getArtistsForAlbum(db, albumId) } : null;
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

export function findAlbumByName(db: Database.Database, name: string): Album | null {
	const row = db
		.prepare(`SELECT ${ALBUM_COLS} FROM albums WHERE LOWER(name) = LOWER(?)`)
		.get(name) as Record<string, unknown> | undefined;
	return row ? rowToAlbum(row) : null;
}

// True if the album's ordered artist list equals artistIds exactly.
function artistSetMatches(
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
// creates one. An empty trimmed name returns null.
export function resolveOrCreateAlbum(
	db: Database.Database,
	name: string,
	artistIds: number[],
	opts: AlbumResolutionOpts = {}
): Album | null {
	const trimmed = name.trim();
	if (trimmed === '') return null;
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
				return alb;
			}
		}

		let artworkPath: string | null = null;
		if (opts.inheritArtworkFromSongId != null) {
			const songRow = tx
				.prepare(`SELECT artwork_path FROM songs WHERE id = ?`)
				.get(opts.inheritArtworkFromSongId) as { artwork_path: string | null } | undefined;
			artworkPath = songRow?.artwork_path ?? null;
		}

		return insertAlbumWithArtists(
			tx,
			{ name: trimmed, artworkPath, genre: null, year: null, isSingle: opts.isSingle ?? false },
			artistIds,
			ts
		);
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
