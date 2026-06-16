import type Database from 'better-sqlite3';
import type { Settings, UpdateSettingsInput } from './models';
import { now } from './rows';
import { inTx } from '../db/tx';

// Port of backend/settings.go. importToAppleMusic is forced false off macOS
// (process.platform replaces Go's runtime.GOOS). Booleans stored as 0/1.

const isMac = (): boolean => process.platform === 'darwin';

export function getSettings(db: Database.Database): Settings {
	const row = db
		.prepare(
			`SELECT id, clear_track_number_on_upload, import_to_apple_music, automatically_make_singles, updated_at FROM settings WHERE id = 1`
		)
		.get() as Record<string, unknown> | undefined;

	if (!row) {
		const ts = now();
		const importToAppleMusic = isMac();
		db.prepare(
			`INSERT INTO settings (id, clear_track_number_on_upload, import_to_apple_music, automatically_make_singles, updated_at) VALUES (1, 0, ?, 0, ?)`
		).run(importToAppleMusic ? 1 : 0, ts);
		return {
			id: 1,
			clearTrackNumberOnUpload: false,
			importToAppleMusic,
			automaticallyMakeSingles: false,
			updatedAt: ts
		};
	}

	return {
		id: 1,
		clearTrackNumberOnUpload: Boolean(row.clear_track_number_on_upload),
		importToAppleMusic: isMac() ? Boolean(row.import_to_apple_music) : false,
		automaticallyMakeSingles: Boolean(row.automatically_make_singles),
		updatedAt: Number(row.updated_at ?? 0)
	};
}

export function updateSettings(db: Database.Database, input: UpdateSettingsInput): Settings {
	const ts = now();
	inTx(db, (tx) => {
		if (input.clearTrackNumberOnUpload !== undefined) {
			tx.prepare(`UPDATE settings SET clear_track_number_on_upload = ? WHERE id = 1`).run(
				input.clearTrackNumberOnUpload ? 1 : 0
			);
		}
		if (input.importToAppleMusic !== undefined) {
			const v = isMac() && input.importToAppleMusic ? 1 : 0;
			tx.prepare(`UPDATE settings SET import_to_apple_music = ? WHERE id = 1`).run(v);
		}
		if (input.automaticallyMakeSingles !== undefined) {
			tx.prepare(`UPDATE settings SET automatically_make_singles = ? WHERE id = 1`).run(
				input.automaticallyMakeSingles ? 1 : 0
			);
		}
		tx.prepare(`UPDATE settings SET updated_at = ? WHERE id = 1`).run(ts);
	});
	return getSettings(db);
}
