import type Database from 'better-sqlite3';
import type {
	Producer,
	ProducerWithAliases,
	ProducerAliasWithArtists,
	Song,
	CreateProducerInput
} from './models';
import { rowToProducer, rowToSong, now } from './rows';

// Port of backend/producers.go (US1 subset). update/delete + WriteProducerMetadata are US2.

// A flat producer-matching term: a producer name or one of its aliases.
// aliasArtistIds is empty for names and unrestricted aliases.
export interface Pattern {
	term: string;
	producerId: number;
	isAlias: boolean;
	aliasArtistIds?: number[];
}

const SONG_COLS =
	's.id, s.name, s.album_id, s.artwork_path, s.genre, s.year, s.track_number, s.duration, s.filepath, s.file_type, s.created_at, s.updated_at, s.synced, s.apple_music_id';

export function createProducerWithAliases(
	db: Database.Database,
	input: CreateProducerInput
): Producer {
	const ts = now();
	return db.transaction((tx) => {
		// Alias uniqueness (case-insensitive, across all producers).
		const dupe = tx.prepare(`SELECT COUNT(*) AS c FROM producer_aliases WHERE LOWER(alias) = LOWER(?)`);
		for (const alias of input.aliases) {
			if ((dupe.get(alias.name) as { c: number }).c > 0) {
				throw new Error(`alias "${alias.name}" already exists for another producer`);
			}
		}

		const info = tx
			.prepare(`INSERT INTO producers (name, created_at, updated_at) VALUES (?, ?, ?)`)
			.run(input.name, ts, ts);
		const producerId = Number(info.lastInsertRowid);

		const insAlias = tx.prepare(
			`INSERT INTO producer_aliases (producer_id, alias, created_at) VALUES (?, ?, ?)`
		);
		const insAliasArtist = tx.prepare(
			`INSERT INTO producer_alias_artists (alias_id, artist_id, created_at) VALUES (?, ?, ?)`
		);
		for (const alias of input.aliases) {
			const aliasId = Number(insAlias.run(producerId, alias.name, ts).lastInsertRowid);
			for (const artistId of alias.artistIds) {
				insAliasArtist.run(aliasId, artistId, ts);
			}
		}

		return { id: producerId, name: input.name, createdAt: ts, updatedAt: ts };
	})(db);
}

export function getProducersWithAliases(db: Database.Database): ProducerWithAliases[] {
	const rows = db
		.prepare(`SELECT id, name, created_at, updated_at FROM producers`)
		.all() as Record<string, unknown>[];
	return rows.map((r) => {
		const prod = rowToProducer(r);
		return {
			...prod,
			aliases: getAliasesForProducer(db, prod.id),
			songs: getSongsForProducer(db, prod.id)
		};
	});
}

export function getAliasesForProducer(
	db: Database.Database,
	producerId: number
): ProducerAliasWithArtists[] {
	const aliases = db
		.prepare(`SELECT id, producer_id, alias, created_at FROM producer_aliases WHERE producer_id = ?`)
		.all(producerId) as { id: number; producer_id: number; alias: string; created_at: number | null }[];
	return aliases.map((a) => {
		const artistIds = (
			db
				.prepare(`SELECT artist_id FROM producer_alias_artists WHERE alias_id = ?`)
				.all(a.id) as { artist_id: number }[]
		).map((r) => r.artist_id);
		return {
			id: a.id,
			producerId: a.producer_id,
			alias: a.alias,
			createdAt: a.created_at ?? 0,
			artistIds
		};
	});
}

export function getSongsForProducer(db: Database.Database, producerId: number): Song[] {
	const rows = db
		.prepare(
			`SELECT ${SONG_COLS} FROM songs s JOIN song_producers sp ON s.id = sp.song_id WHERE sp.producer_id = ?`
		)
		.all(producerId) as Record<string, unknown>[];
	return rows.map(rowToSong);
}

// Loads all producer-matching patterns in one query (no N+1). Each producer
// contributes one name row + one row per alias; artist restrictions via GROUP_CONCAT.
export function loadProducerPatterns(db: Database.Database): Pattern[] {
	const rows = db
		.prepare(
			`SELECT p.id AS producer_id, p.name, pa.alias, GROUP_CONCAT(paa.artist_id) AS artist_ids
			 FROM producers p
			 LEFT JOIN producer_aliases pa ON pa.producer_id = p.id
			 LEFT JOIN producer_alias_artists paa ON paa.alias_id = pa.id
			 GROUP BY p.id, pa.id`
		)
		.all() as { producer_id: number; name: string; alias: string | null; artist_ids: string | null }[];

	const seenName = new Set<number>();
	const patterns: Pattern[] = [];
	for (const r of rows) {
		if (!seenName.has(r.producer_id)) {
			patterns.push({ term: r.name.toLowerCase(), producerId: r.producer_id, isAlias: false });
			seenName.add(r.producer_id);
		}
		if (r.alias != null) {
			const ids =
				r.artist_ids && r.artist_ids !== ''
					? r.artist_ids.split(',').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n))
					: [];
			patterns.push({
				term: r.alias.toLowerCase(),
				producerId: r.producer_id,
				isAlias: true,
				aliasArtistIds: ids
			});
		}
	}
	return patterns;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pure matching algorithm: word-boundary scan then substring fallback, longest
// term first, artist-restriction filter, range-tracking to avoid overlaps.
export function matchPatterns(
	filename: string,
	patterns: Pattern[],
	songArtistIds: number[]
): number[] {
	const nameWithoutExt = filename.toLowerCase().replace(/\.[^/.]+$/, '');

	const sorted = [...patterns].sort((a, b) => b.term.length - a.term.length);

	const isArtistContextValid = (aliasArtistIds?: number[]): boolean => {
		if (!aliasArtistIds || aliasArtistIds.length === 0) return true;
		if (songArtistIds.length === 0) return false;
		return songArtistIds.some((aid) => aliasArtistIds.includes(aid));
	};

	const consumed: { start: number; end: number }[] = [];
	const isRangeConsumed = (start: number, end: number): boolean =>
		consumed.some(
			(r) =>
				(start >= r.start && start < r.end) ||
				(end > r.start && end <= r.end) ||
				(start <= r.start && end >= r.end)
		);

	const matched = new Set<number>();

	// pass 1: word-boundary matches
	for (const p of sorted) {
		if (p.isAlias && !isArtistContextValid(p.aliasArtistIds)) continue;
		if (p.term === '') continue;
		const re = new RegExp(`\\b${escapeRegExp(p.term)}\\b`, 'g');
		for (const m of nameWithoutExt.matchAll(re)) {
			const start = m.index ?? 0;
			const end = start + m[0].length;
			if (!isRangeConsumed(start, end)) {
				matched.add(p.producerId);
				consumed.push({ start, end });
			}
		}
	}

	// pass 2: substring fallback
	for (const p of sorted) {
		if (p.isAlias && !isArtistContextValid(p.aliasArtistIds)) continue;
		if (p.term === '') continue;
		const idx = nameWithoutExt.indexOf(p.term);
		if (idx === -1) continue;
		const end = idx + p.term.length;
		if (!isRangeConsumed(idx, end)) {
			matched.add(p.producerId);
			consumed.push({ start: idx, end });
		}
	}

	return [...matched].sort((a, b) => a - b);
}

export function matchProducersFromFilename(
	db: Database.Database,
	filename: string,
	songArtistIds: number[]
): number[] {
	return matchPatterns(filename, loadProducerPatterns(db), songArtistIds);
}
