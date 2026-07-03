import Database from 'better-sqlite3';

// Electron domain queries still use LOWER(...) for case-insensitive lookups.
export function registerLower(db: Database.Database): void {
	db.function('LOWER', { deterministic: true }, (s: unknown) =>
		s == null ? null : String(s).toLowerCase()
	);
}

export function openDatabase(dbPath: string): Database.Database {
	const db = new Database(dbPath);
	registerLower(db);
	return db;
}
