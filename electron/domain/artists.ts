import type Database from 'better-sqlite3';
import type { Artist, CreateArtistInput } from './models';
import { ARTIST_COLS, rowToArtist, now } from './rows';

// Port of backend/artists.go + ParseArtists from backend/utils.go.

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

export function findArtistByName(db: Database.Database, name: string): Artist | null {
	const row = db
		.prepare(`SELECT ${ARTIST_COLS} FROM artists WHERE LOWER(name) = LOWER(?)`)
		.get(name) as Record<string, unknown> | undefined;
	return row ? rowToArtist(row) : null;
}
