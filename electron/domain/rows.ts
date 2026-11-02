import type { Artist, Album, Song, Producer } from './models';

// Row mappers: snake_case SQLite rows → camelCase domain models. better-sqlite3
// returns INTEGER/REAL as number and NULL as null. A null timestamp becomes 0.

export type Row = Record<string, unknown>;

export const SONG_COLS =
	'id, name, album_id, artwork_path, genre, year, track_number, duration, filepath, created_at, updated_at, apple_music_id';
export const ALBUM_COLS =
	'id, name, artwork_path, genre, year, is_single, created_at, updated_at';
export const ARTIST_COLS =
	'id, name, image, career_start_year, career_end_year, created_at, updated_at';

// Prefixes each column with a table alias, for SELECTs that join a junction table.
export const qualify = (cols: string, alias: string): string =>
	cols
		.split(', ')
		.map((col) => `${alias}.${col}`)
		.join(', ');

export function now(): number {
	return Math.floor(Date.now() / 1000);
}

export const int = (v: unknown): number | null => (v == null ? null : Number(v));
export const str = (v: unknown): string | null => (v == null ? null : String(v));
const bool = (v: unknown): boolean => Boolean(v);

export function rowToArtist(r: Row): Artist {
	return {
		id: Number(r.id),
		name: String(r.name),
		image: str(r.image),
		careerStartYear: int(r.career_start_year),
		careerEndYear: int(r.career_end_year),
		createdAt: Number(r.created_at ?? 0),
		updatedAt: Number(r.updated_at ?? 0)
	};
}

export function rowToAlbum(r: Row): Album {
	return {
		id: Number(r.id),
		name: String(r.name),
		artworkPath: str(r.artwork_path),
		genre: str(r.genre),
		year: int(r.year),
		isSingle: bool(r.is_single),
		createdAt: Number(r.created_at ?? 0),
		updatedAt: Number(r.updated_at ?? 0)
	};
}

export function rowToSong(r: Row): Song {
	return {
		id: Number(r.id),
		name: String(r.name),
		albumId: int(r.album_id),
		artworkPath: str(r.artwork_path),
		genre: str(r.genre),
		year: int(r.year),
		trackNumber: int(r.track_number),
		duration: int(r.duration),
		filepath: String(r.filepath),
		appleMusicId: r.apple_music_id == null ? undefined : String(r.apple_music_id),
		createdAt: Number(r.created_at ?? 0),
		updatedAt: Number(r.updated_at ?? 0)
	};
}

export function rowToProducer(r: Row): Producer {
	return {
		id: Number(r.id),
		name: String(r.name),
		createdAt: Number(r.created_at ?? 0),
		updatedAt: Number(r.updated_at ?? 0)
	};
}
