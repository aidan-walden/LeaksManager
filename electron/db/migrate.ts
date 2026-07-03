import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

// Runs electron/migrations/*.up.sql, tracked compatibly with golang-migrate's
// existing schema_migrations table — which is SINGLE-ROW
// (latest version only), not one row per migration. An existing macOS prod DB
// already has it populated, so we read it rather than recreate a conflicting one.

// Core table whose presence proves a DB predates our tracking (zero-migration).
const CORE_TABLE = 'songs';

type Migration = { version: number; sql: string };

function loadMigrations(migrationsDir: string): Migration[] {
	return readdirSync(migrationsDir)
		.filter((f) => f.endsWith('.up.sql'))
		.map((f) => {
			const version = parseInt(f.split('_')[0], 10);
			if (!Number.isFinite(version)) {
				throw new Error(`migration filename missing numeric prefix: ${f}`);
			}
			return { version, sql: readFileSync(join(migrationsDir, f), 'utf8') };
		})
		.sort((a, b) => a.version - b.version);
}

function tableExists(db: Database.Database, name: string): boolean {
	return !!db
		.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
		.get(name);
}

function setVersion(db: Database.Database, version: number): void {
	// golang-migrate keeps exactly one row; mirror that.
	db.prepare('DELETE FROM schema_migrations').run();
	db.prepare('INSERT INTO schema_migrations (version, dirty) VALUES (?, 0)').run(version);
}

export function migrate(db: Database.Database, migrationsDir: string): void {
	const migrations = loadMigrations(migrationsDir);
	if (migrations.length === 0) return;
	const latest = migrations[migrations.length - 1].version;

	let current = 0;
	if (tableExists(db, 'schema_migrations')) {
		const row = db
			.prepare('SELECT version, dirty FROM schema_migrations LIMIT 1')
			.get() as { version: number; dirty: number } | undefined;
		if (row?.dirty) {
			throw new Error(`database is in a dirty migration state at version ${row.version}`);
		}
		current = row?.version ?? 0;
	} else {
		// No tracking table yet. A DB that already has CORE_TABLE predates our
		// tracking (golang-migrate era) and holds migration 1's schema, so stamp
		// it at version 1 and let the loop apply everything after it. A truly
		// fresh DB starts at 0 and runs the whole set.
		// ponytail: assumes legacy DB predates is_single; add a column guard if that ceiling breaks
		current = tableExists(db, CORE_TABLE) ? 1 : 0;
		db.exec('CREATE TABLE schema_migrations (version BIGINT NOT NULL, dirty BOOLEAN NOT NULL)');
		setVersion(db, current);
	}

	for (const m of migrations) {
		if (m.version <= current) continue;
		db.transaction(() => {
			db.exec(m.sql);
			setVersion(db, m.version);
		})();
	}
}
