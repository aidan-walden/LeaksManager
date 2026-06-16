import Database from 'better-sqlite3';

// Port of the sqlite3_custom driver hook in backend/app.go: register a
// case-insensitive LOWER (Go used strings.ToLower via RegisterFunc). Exposed so
// in-memory test DBs get the same function the domain code's LOWER(...) lookups rely on.
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
