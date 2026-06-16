import type { Artist, Album, Song, Producer } from './models';

// Row mappers: snake_case SQLite rows → camelCase domain models. better-sqlite3
// returns INTEGER/REAL as number and NULL as null; 0/1 sync flags become booleans.
// Go used sql.NullInt64 for timestamps (zero when null) — mirror with `?? 0`.

type Row = Record<string, unknown>;

export function now(): number {
	return Math.floor(Date.now() / 1000);
}

const int = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (v == null ? null : String(v));
const bool = (v: unknown): boolean => Boolean(v);

export function rowToArtist(r: Row): Artist {
	return {
		id: Number(r.id),
		name: String(r.name),
		image: str(r.image),
		careerStartYear: int(r.career_start_year),
		careerEndYear: int(r.career_end_year),
		createdAt: Number(r.created_at ?? 0),
		updatedAt: Number(r.updated_at ?? 0),
		synced: bool(r.synced)
	};
}

export function rowToAlbum(r: Row): Album {
	return {
		id: Number(r.id),
		name: String(r.name),
		artworkPath: str(r.artwork_path),
		genre: str(r.genre),
		year: int(r.year),
		// is_single is omitted from some SELECTs (parity with Go getAlbumsByArtist) → false.
		isSingle: bool(r.is_single),
		createdAt: Number(r.created_at ?? 0),
		updatedAt: Number(r.updated_at ?? 0),
		synced: bool(r.synced)
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
		fileType: str(r.file_type),
		appleMusicId: r.apple_music_id == null ? undefined : String(r.apple_music_id),
		createdAt: Number(r.created_at ?? 0),
		updatedAt: Number(r.updated_at ?? 0),
		synced: bool(r.synced)
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
