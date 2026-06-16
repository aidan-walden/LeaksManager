import type Database from 'better-sqlite3';

// Replaces Go's InTx (db.go). better-sqlite3 is synchronous: db.transaction
// commits on return and rolls back if fn throws. The wrapper just forwards db.
export function inTx<T>(db: Database.Database, fn: (db: Database.Database) => T): T {
	return db.transaction(fn)(db);
}
