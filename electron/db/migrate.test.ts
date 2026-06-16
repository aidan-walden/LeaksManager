import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from './migrate';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../backend/migrations');
const LATEST = 3; // backend/migrations: 000001..000003

function names(db: Database.Database, type: 'table' | 'trigger'): string[] {
	return (
		db.prepare(`SELECT name FROM sqlite_master WHERE type=?`).all(type) as { name: string }[]
	).map((r) => r.name);
}

function version(db: Database.Database): number {
	return (db.prepare('SELECT version FROM schema_migrations').get() as { version: number }).version;
}

describe('migrate', () => {
	it('applies all migrations to a fresh DB (tables + triggers + version)', () => {
		const db = new Database(':memory:');
		migrate(db, MIGRATIONS_DIR);

		const tables = names(db, 'table');
		for (const t of ['songs', 'albums', 'artists', 'producers', 'settings', 'schema_migrations']) {
			expect(tables).toContain(t);
		}
		// 000002 sync_triggers must be present (sync-dirty invariant depends on them).
		expect(names(db, 'trigger')).toContain('song_metadata_update_cascade');
		expect(version(db)).toBe(LATEST);
	});

	it('is idempotent — re-running is a no-op and data survives', () => {
		const db = new Database(':memory:');
		migrate(db, MIGRATIONS_DIR);
		db.prepare(`INSERT INTO artists (name) VALUES ('Keef')`).run();

		expect(() => migrate(db, MIGRATIONS_DIR)).not.toThrow();

		expect(version(db)).toBe(LATEST);
		expect((db.prepare(`SELECT name FROM artists`).get() as { name: string }).name).toBe('Keef');
	});

	it('zero-migration: a pre-tracking DB with existing schema is marked applied, not rebuilt', () => {
		// Simulate a legacy DB (golang-migrate era) that has the schema but no
		// schema_migrations row our code recognizes — must NOT re-run migration 1.
		const db = new Database(':memory:');
		db.exec('CREATE TABLE songs (id INTEGER PRIMARY KEY, name TEXT)');
		db.prepare(`INSERT INTO songs (id, name) VALUES (1, 'leak')`).run();

		expect(() => migrate(db, MIGRATIONS_DIR)).not.toThrow();

		expect(version(db)).toBe(LATEST);
		expect((db.prepare('SELECT COUNT(*) AS c FROM songs').get() as { c: number }).c).toBe(1);
	});
});
