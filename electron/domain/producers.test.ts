import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from '../db/migrate';
import { registerLower } from '../db/connection';
import {
	matchPatterns,
	matchProducersFromFilename,
	createProducerWithAliases,
	type Pattern
} from './producers';
import { createArtist } from './artists';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../backend/migrations');

function freshDb(): Database.Database {
	const db = new Database(':memory:');
	registerLower(db);
	migrate(db, MIGRATIONS_DIR);
	return db;
}

// Parity mirror of backend/producers_test.go TestMatchPatterns — pure algorithm.
describe('matchPatterns', () => {
	const patterns: Pattern[] = [
		{ term: 'metro boomin', producerId: 1, isAlias: false },
		{ term: 'metro', producerId: 1, isAlias: true, aliasArtistIds: [100] },
		{ term: 'wheezy', producerId: 2, isAlias: false },
		{ term: 'wheezy outta here', producerId: 2, isAlias: true },
		{ term: 'cash', producerId: 3, isAlias: false }
	];

	const cases: { name: string; filename: string; songArtistIds?: number[]; want: number[] }[] = [
		{ name: 'exact producer name match', filename: 'Song [Metro Boomin].mp3', want: [1] },
		{
			name: 'alias match with valid artist',
			filename: 'Song [Metro].mp3',
			songArtistIds: [100],
			want: [1]
		},
		{
			name: 'restricted alias skipped when artist not in context',
			filename: 'Song [Metro].mp3',
			songArtistIds: [999],
			want: []
		},
		{ name: 'restricted alias skipped when no song artists', filename: 'Song [Metro].mp3', want: [] },
		{
			name: 'multi-word term does not match inside concatenated token',
			filename: 'metroboomintrack.mp3',
			want: []
		},
		{ name: 'longer alias wins over substring', filename: 'Track (Wheezy Outta Here).mp3', want: [2] },
		{
			name: 'multiple producers in filename',
			filename: 'Song [Metro] (Wheezy Outta Here).mp3',
			songArtistIds: [100],
			want: [1, 2]
		},
		{ name: 'real filename matches both via names', filename: 'Metro Boomin x Wheezy.mp3', want: [1, 2] }
	];

	for (const tc of cases) {
		it(tc.name, () => {
			expect(matchPatterns(tc.filename, patterns, tc.songArtistIds ?? [])).toEqual(tc.want);
		});
	}
});

// Parity mirror of TestMatchProducersFromFilenameHonorsAliasRestrictionsAndLongestMatches.
describe('matchProducersFromFilename', () => {
	let db: Database.Database;
	beforeEach(() => {
		db = freshDb();
	});

	it('honors alias restrictions and longest matches', () => {
		const restricted = createArtist(db, { name: 'Restricted Artist' });
		const other = createArtist(db, { name: 'Other Artist' });

		const metro = createProducerWithAliases(db, {
			name: 'Metro Boomin',
			aliases: [{ name: 'Metro', artistIds: [restricted.id] }]
		});
		const wheezy = createProducerWithAliases(db, {
			name: 'Wheezy',
			aliases: [{ name: 'Wheezy Outta Here', artistIds: [] }]
		});
		expect(metro.id).not.toBe(wheezy.id);

		expect(
			matchProducersFromFilename(db, 'Song [Metro] (Wheezy Outta Here).mp3', [restricted.id])
		).toHaveLength(2);

		expect(matchProducersFromFilename(db, 'Song [Metro].mp3', [other.id])).toHaveLength(0);

		expect(matchProducersFromFilename(db, 'Metro Boomin x Wheezy.mp3', [restricted.id])).toHaveLength(
			2
		);
	});

	it('rejects a duplicate alias across producers (case-insensitive)', () => {
		createProducerWithAliases(db, { name: 'A', aliases: [{ name: 'Dupe', artistIds: [] }] });
		expect(() =>
			createProducerWithAliases(db, { name: 'B', aliases: [{ name: 'dupe', artistIds: [] }] })
		).toThrow();
	});
});
