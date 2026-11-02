import { it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from '../db/migrate';
import { configureConnection } from '../db/connection';
import { getSettings, updateSettings } from './settings';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../migrations');

it('updateSettings changes only the fields it receives, including on a fresh database', () => {
	const db = new Database(':memory:');
	configureConnection(db);
	migrate(db, MIGRATIONS_DIR);

	updateSettings(db, { clearTrackNumberOnUpload: true, automaticallyMakeSingles: true });
	updateSettings(db, { automaticallyMakeSingles: false });

	const settings = getSettings(db);
	expect(settings.clearTrackNumberOnUpload).toBe(true);
	expect(settings.automaticallyMakeSingles).toBe(false);
});
