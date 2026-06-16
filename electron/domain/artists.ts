import type Database from 'better-sqlite3';
import type { Artist, ArtistWithRelations, Album, Song, CreateArtistInput } from './models';
import { rowToArtist, rowToAlbum, rowToSong, now } from './rows';

// Port of backend/artists.go + ParseArtists from backend/utils.go.

const ARTIST_COLS =
	'id, name, image, career_start_year, career_end_year, created_at, updated_at, synced';

// parseArtists splits an artist string by common delimiters, trims, and dedupes
// (case-sensitive) while preserving order. Mirror of backend/utils.go ParseArtists.
export function parseArtists(artistString: string | null | undefined): string[] {
	if (!artistString || artistString.trim().length === 0) {
		return [];
	}
	const parts = artistString.split(/[,&;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+/i);
	const seen = new Set<string>();
	const result: string[] = [];
	for (const part of parts) {
		const trimmed = part.trim();
		if (trimmed !== '' && !seen.has(trimmed)) {
			seen.add(trimmed);
			result.push(trimmed);
		}
	}
	return result;
}

export function createArtist(db: Database.Database, input: CreateArtistInput): Artist {
	const ts = now();
	const info = db
		.prepare(
			`INSERT INTO artists (name, career_start_year, career_end_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
		)
		.run(input.name, input.careerStartYear ?? null, input.careerEndYear ?? null, ts, ts);
	return {
		id: Number(info.lastInsertRowid),
		name: input.name,
		image: null,
		careerStartYear: input.careerStartYear ?? null,
		careerEndYear: input.careerEndYear ?? null,
		createdAt: ts,
		updatedAt: ts,
		synced: false
	};
}

export function getArtists(db: Database.Database): Artist[] {
	return (db.prepare(`SELECT ${ARTIST_COLS} FROM artists`).all() as Record<string, unknown>[]).map(
		rowToArtist
	);
}

export function getArtistsWithRelations(db: Database.Database): ArtistWithRelations[] {
	return getArtists(db).map((art) => ({
		...art,
		albums: getAlbumsByArtist(db, art.id),
		songs: getSongsByArtist(db, art.id)
	}));
}

export function findArtistByName(db: Database.Database, name: string): Artist | null {
	const row = db
		.prepare(`SELECT ${ARTIST_COLS} FROM artists WHERE LOWER(name) = LOWER(?)`)
		.get(name) as Record<string, unknown> | undefined;
	return row ? rowToArtist(row) : null;
}

// Albums an artist appears on, ordered by the album_artists junction order.
export function getAlbumsByArtist(db: Database.Database, artistId: number): Album[] {
	const rows = db
		.prepare(
			`SELECT a.id, a.name, a.artwork_path, a.genre, a.year, a.created_at, a.updated_at, a.synced
			 FROM albums a
			 JOIN album_artists aa ON a.id = aa.album_id
			 WHERE aa.artist_id = ?
			 ORDER BY aa."order"`
		)
		.all(artistId) as Record<string, unknown>[];
	return rows.map(rowToAlbum);
}

// Songs an artist appears on, ordered by the song_artists junction order.
export function getSongsByArtist(db: Database.Database, artistId: number): Song[] {
	const rows = db
		.prepare(
			`SELECT s.id, s.name, s.album_id, s.artwork_path, s.genre, s.year, s.track_number, s.duration, s.filepath, s.file_type, s.created_at, s.updated_at, s.synced, s.apple_music_id
			 FROM songs s
			 JOIN song_artists sa ON s.id = sa.song_id
			 WHERE sa.artist_id = ?
			 ORDER BY sa."order"`
		)
		.all(artistId) as Record<string, unknown>[];
	return rows.map(rowToSong);
}
