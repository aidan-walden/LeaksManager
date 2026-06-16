import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

// Runs backend/migrations/*.up.sql (reused verbatim), tracked compatibly with
// golang-migrate's existing schema_migrations table — which is SINGLE-ROW
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
	} else if (tableExists(db, CORE_TABLE)) {
		// DB predates our tracking but already has the schema → mark all applied,
		// run nothing. Reproduces golang-migrate's no-op on existing data.
		db.exec('CREATE TABLE schema_migrations (version BIGINT NOT NULL, dirty BOOLEAN NOT NULL)');
		setVersion(db, latest);
		return;
	} else {
		db.exec('CREATE TABLE schema_migrations (version BIGINT NOT NULL, dirty BOOLEAN NOT NULL)');
	}

	for (const m of migrations) {
		if (m.version <= current) continue;
		db.transaction(() => {
			db.exec(m.sql);
			setVersion(db, m.version);
		})();
	}
}
