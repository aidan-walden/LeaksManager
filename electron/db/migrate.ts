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

function objectExists(db: Database.Database, type: string, name: string): boolean {
	return !!db
		.prepare(`SELECT name FROM sqlite_master WHERE type=? AND name=?`)
		.get(type, name);
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
	const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	return cols.some((c) => c.name === column);
}

// A tracking-less DB predates our schema_migrations table (golang-migrate era). Infer
// how far its schema already advanced from feature detection so we don't re-run an
// already-applied, non-idempotent migration (e.g. 000003's ALTER TABLE ADD COLUMN would
// fail with "duplicate column"). Newest feature first.
function detectLegacyVersion(db: Database.Database): number {
	if (columnExists(db, 'albums', 'is_single')) return 3; // 000003_album_is_single
	if (objectExists(db, 'trigger', 'album_metadata_update_cascade')) return 2; // 000002_sync_triggers
	return 1; // 000001_initial_schema (CORE_TABLE present)
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
		// tracking (golang-migrate era); infer how far its schema advanced by feature
		// detection so the loop only applies migrations it is actually missing. A truly
		// fresh DB starts at 0 and runs the whole set.
		current = tableExists(db, CORE_TABLE) ? detectLegacyVersion(db) : 0;
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
