import type Database from 'better-sqlite3';
import type { Settings, UpdateSettingsInput } from './models';
import { now } from './rows';

// importToAppleMusic is forced false off macOS. Booleans are stored as 0/1.

export const isMac = (): boolean => process.platform === 'darwin';

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
	const flag = (value: boolean | undefined) => (value === undefined ? null : value ? 1 : 0);
	// Ensure the singleton row exists, or the UPDATE silently does nothing on a fresh DB.
	getSettings(db);
	db.prepare(
		`UPDATE settings SET
			clear_track_number_on_upload = COALESCE(?, clear_track_number_on_upload),
			import_to_apple_music = COALESCE(?, import_to_apple_music),
			automatically_make_singles = COALESCE(?, automatically_make_singles),
			updated_at = ?
		 WHERE id = 1`
	).run(
		flag(input.clearTrackNumberOnUpload),
		flag(input.importToAppleMusic && isMac()),
		flag(input.automaticallyMakeSingles),
		now()
	);
	return getSettings(db);
}
