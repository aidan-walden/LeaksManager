import type Database from 'better-sqlite3';
import type {
	Producer,
	ProducerWithAliases,
	ProducerAliasWithArtists,
	CreateProducerInput,
	UpdateProducerInput,
	BatchResult
} from './models';
import { rowToProducer, now } from './rows';
import { writeSongsMetadata } from './songs';

// A flat producer-matching term: a producer name or one of its aliases.
// aliasArtistIds is absent or empty for names and unrestricted aliases.
export interface Pattern {
	term: string;
	producerId: number;
	aliasArtistIds?: number[];
}

// Escape regex metacharacters in a producer term. `RegExp.escape` is only available
// on Node 24+ (Electron's bundled runtime), but the test suite and tooling run on the
// repo's Node 22, where it is undefined and would throw. This fallback keeps matching
// working everywhere and also guards terms containing `.`, `(`, `+`, etc.
function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Alias uniqueness (case-insensitive) across all producers, except the one being edited.
function assertAliasesUnique(
	tx: Database.Database,
	aliases: CreateProducerInput['aliases'],
	excludeProducerId: number | null
): void {
	const dupe = tx.prepare(
		`SELECT COUNT(*) AS c FROM producer_aliases WHERE LOWER(alias) = LOWER(?) AND producer_id IS NOT ?`
	);
	for (const alias of aliases) {
		if ((dupe.get(alias.name, excludeProducerId) as { c: number }).c > 0) {
			throw new Error(`alias "${alias.name}" already exists for another producer`);
		}
	}
}

function insertAliases(
	tx: Database.Database,
	producerId: number,
	aliases: CreateProducerInput['aliases'],
	ts: number
): void {
	const insAlias = tx.prepare(
		`INSERT INTO producer_aliases (producer_id, alias, created_at) VALUES (?, ?, ?)`
	);
	const insAliasArtist = tx.prepare(
		`INSERT INTO producer_alias_artists (alias_id, artist_id, created_at) VALUES (?, ?, ?)`
	);
	for (const alias of aliases) {
		const aliasId = Number(insAlias.run(producerId, alias.name, ts).lastInsertRowid);
		for (const artistId of alias.artistIds) {
			insAliasArtist.run(aliasId, artistId, ts);
		}
	}
}

export function createProducerWithAliases(
	db: Database.Database,
	input: CreateProducerInput
): Producer {
	const ts = now();
	return db.transaction((tx) => {
		assertAliasesUnique(tx, input.aliases, null);

		const info = tx
			.prepare(`INSERT INTO producers (name, created_at, updated_at) VALUES (?, ?, ?)`)
			.run(input.name, ts, ts);
		const producerId = Number(info.lastInsertRowid);

		insertAliases(tx, producerId, input.aliases, ts);

		return { id: producerId, name: input.name, createdAt: ts, updatedAt: ts };
	})(db);
}

export function updateProducerWithAliases(
	db: Database.Database,
	input: UpdateProducerInput
): Producer {
	const ts = now();
	return db.transaction((tx) => {
		const existing = tx
			.prepare(`SELECT created_at FROM producers WHERE id = ?`)
			.get(input.id) as { created_at: number } | undefined;
		if (!existing) throw new Error(`producer ${input.id} not found`);

		assertAliasesUnique(tx, input.aliases, input.id);

		tx.prepare(`UPDATE producers SET name = ?, updated_at = ? WHERE id = ?`).run(
			input.name,
			ts,
			input.id
		);

		// Replace existing aliases; their artist restrictions go with them via ON DELETE CASCADE.
		tx.prepare(`DELETE FROM producer_aliases WHERE producer_id = ?`).run(input.id);
		insertAliases(tx, input.id, input.aliases, ts);

		return { id: input.id, name: input.name, createdAt: existing.created_at, updatedAt: ts };
	})(db);
}

export function deleteProducer(db: Database.Database, producerId: number): void {
	db.prepare(`DELETE FROM producers WHERE id = ?`).run(producerId);
}

export function getProducersWithAliases(db: Database.Database): ProducerWithAliases[] {
	const rows = db
		.prepare(`SELECT id, name, created_at, updated_at FROM producers`)
		.all() as Record<string, unknown>[];
	return rows.map((r) => {
		const prod = rowToProducer(r);
		return { ...prod, aliases: getAliasesForProducer(db, prod.id) };
	});
}

function getAliasesForProducer(
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

// Loads all producer-matching patterns in one query (no N+1). Each producer
// contributes one name row + one row per alias; artist restrictions via GROUP_CONCAT.
function loadProducerPatterns(db: Database.Database): Pattern[] {
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
			patterns.push({ term: r.name.toLowerCase(), producerId: r.producer_id });
			seenName.add(r.producer_id);
		}
		if (r.alias != null) {
			patterns.push({
				term: r.alias.toLowerCase(),
				producerId: r.producer_id,
				aliasArtistIds: r.artist_ids ? r.artist_ids.split(',').map(Number) : []
			});
		}
	}
	return patterns;
}

// Pure matching algorithm: word-boundary scan then substring fallback, longest
// term first, artist-restriction filter, range-tracking to avoid overlaps.
export function matchPatterns(
	filename: string,
	patterns: Pattern[],
	songArtistIds: number[]
): number[] {
	return matchPatternsInText(filename.replace(/\.[^/.]+$/, ''), patterns, songArtistIds);
}

function matchPatternsInText(
	text: string,
	patterns: Pattern[],
	songArtistIds: number[]
): number[] {
	const lowerText = text.toLowerCase();

	const isArtistContextValid = (aliasArtistIds?: number[]): boolean =>
		!aliasArtistIds?.length || songArtistIds.some((aid) => aliasArtistIds.includes(aid));

	const eligible = patterns
		.filter((p) => p.term !== '' && isArtistContextValid(p.aliasArtistIds))
		.sort((a, b) => b.term.length - a.term.length);

	const consumed: { start: number; end: number }[] = [];
	const matched = new Set<number>();

	const claim = (producerId: number, start: number, end: number) => {
		if (consumed.some((r) => start < r.end && end > r.start)) return;
		matched.add(producerId);
		consumed.push({ start, end });
	};

	// pass 1: word-boundary matches
	for (const p of eligible) {
		const re = new RegExp(`\\b${escapeRegExp(p.term)}\\b`, 'g');
		for (const m of lowerText.matchAll(re)) {
			claim(p.producerId, m.index, m.index + m[0].length);
		}
	}

	// pass 2: substring fallback
	for (const p of eligible) {
		const idx = lowerText.indexOf(p.term);
		if (idx !== -1) claim(p.producerId, idx, idx + p.term.length);
	}

	return [...matched].sort((a, b) => a - b);
}

// WriteProducerMetadata writes tags to every song by a producer (re-tagging so each
// file reflects current state). Mirrors backend/producers.go WriteProducerMetadata.
export async function writeProducerMetadata(
	db: Database.Database,
	staticPath: string,
	producerId: number
): Promise<BatchResult> {
	const rows = db
		.prepare(`SELECT song_id FROM song_producers WHERE producer_id = ?`)
		.all(producerId) as { song_id: number }[];
	return writeSongsMetadata(
		db,
		staticPath,
		rows.map((r) => r.song_id)
	);
}

export function matchProducersFromFilename(
	db: Database.Database,
	filename: string,
	songArtistIds: number[]
): number[] {
	return matchPatterns(filename, loadProducerPatterns(db), songArtistIds);
}

// Credits are not filenames: a name such as "J. Knight" has no extension to strip.
export function matchProducersFromCredits(
	db: Database.Database,
	credits: string[],
	songArtistIds: number[]
): number[] {
	return matchPatternsInText(credits.join(' | '), loadProducerPatterns(db), songArtistIds);
}
