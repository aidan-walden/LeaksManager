import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from './migrate';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../migrations');
const LATEST = 3; // electron/migrations: 000001..000003

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

	it('zero-migration: a pre-tracking DB gets later migrations applied, not re-run from scratch', () => {
		// Simulate a legacy DB (golang-migrate era) that already has migration 1's
		// schema but no schema_migrations row our code recognizes. We must NOT
		// re-run migration 1, but we MUST still apply migrations 2 and 3.
		const db = new Database(':memory:');
		db.exec(readFileSync(join(MIGRATIONS_DIR, '000001_initial_schema.up.sql'), 'utf8'));
		db.prepare(`INSERT INTO songs (id, name, filepath) VALUES (1, 'leak', 'uploads/songs/1-leak.mp3')`).run();

		expect(() => migrate(db, MIGRATIONS_DIR)).not.toThrow();

		expect(version(db)).toBe(LATEST);
		expect((db.prepare('SELECT COUNT(*) AS c FROM songs').get() as { c: number }).c).toBe(1);

		// Migration 3 must have run: the is_single column exists on albums.
		const albumCols = (
			db.prepare(`PRAGMA table_info(albums)`).all() as { name: string }[]
		).map((c) => c.name);
		expect(albumCols).toContain('is_single');

		// Migration 2 must have run: at least one sync trigger exists.
		expect(names(db, 'trigger').length).toBeGreaterThan(0);
	});

	it('legacy DB already at the latest schema is stamped correctly, not re-migrated', () => {
		// A tracking-less legacy DB that had ALL migrations applied in the golang-migrate
		// era (is_single column + triggers present). Re-running 000003's non-idempotent
		// ALTER TABLE ADD COLUMN would throw "duplicate column"; feature detection must
		// stamp it at LATEST and skip re-application.
		const db = new Database(':memory:');
		db.exec(readFileSync(join(MIGRATIONS_DIR, '000001_initial_schema.up.sql'), 'utf8'));
		db.exec(readFileSync(join(MIGRATIONS_DIR, '000002_sync_triggers.up.sql'), 'utf8'));
		db.exec(readFileSync(join(MIGRATIONS_DIR, '000003_album_is_single.up.sql'), 'utf8'));

		expect(() => migrate(db, MIGRATIONS_DIR)).not.toThrow();
		expect(version(db)).toBe(LATEST);
	});
});
