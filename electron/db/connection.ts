import Database from 'better-sqlite3';

// Electron domain queries still use LOWER(...) for case-insensitive lookups.
export function registerLower(db: Database.Database): void {
	db.function('LOWER', { deterministic: true }, (s: unknown) =>
		s == null ? null : String(s).toLowerCase()
	);
}

// Shared per-connection setup. better-sqlite3 leaves foreign-key enforcement OFF
// by default, but the schema relies on ON DELETE CASCADE / SET NULL (junction
// cleanup, album unlink). Without this, deleteSong/deleteProducer would orphan
// rows. Must run outside any transaction (a no-op inside one).
export function configureConnection(db: Database.Database): void {
	registerLower(db);
	db.pragma('foreign_keys = ON');
}

export function openDatabase(dbPath: string): Database.Database {
	const db = new Database(dbPath);
	configureConnection(db);
	return db;
}
