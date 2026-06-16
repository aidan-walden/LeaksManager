import Database from 'better-sqlite3';

// Port of the sqlite3_custom driver hook in backend/app.go: open the DB and
// register a case-insensitive LOWER (Go used strings.ToLower via RegisterFunc).
export function openDatabase(dbPath: string): Database.Database {
	const db = new Database(dbPath);
	db.function('LOWER', { deterministic: true }, (s: unknown) =>
		s == null ? null : String(s).toLowerCase()
	);
	return db;
}
