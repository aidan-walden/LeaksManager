package backend

import (
	"database/sql"
	"time"
)

// --- Settings ---

func (a *App) GetSettings() (*Settings, error) {
	var s Settings
	var updatedAt sql.NullInt64
	err := a.db.QueryRow(`
		SELECT id, clear_track_number_on_upload, import_to_apple_music, automatically_make_singles, updated_at
		FROM settings WHERE id = 1
	`).Scan(&s.ID, &s.ClearTrackNumberOnUpload, &s.ImportToAppleMusic, &s.AutomaticallyMakeSingles, &updatedAt)

	if err == sql.ErrNoRows {
		// Initialize default settings
		now := time.Now().Unix()
		if _, err := a.db.Exec(`INSERT INTO settings (id, clear_track_number_on_upload, import_to_apple_music, automatically_make_singles, updated_at) VALUES (1, 0, 0, 0, ?)`, now); err != nil {
			return nil, err
		}
		return &Settings{ID: 1, UpdatedAt: now}, nil
	}
	if err != nil {
		return nil, err
	}
	s.UpdatedAt = updatedAt.Int64
	return &s, nil
}

func (a *App) UpdateSettings(input UpdateSettingsInput) (*Settings, error) {
	now := time.Now().Unix()
	tx, err := a.db.Begin()
	if err != nil {
		return nil, err
	}

	// Build dynamic update
	if input.ClearTrackNumberOnUpload != nil {
		if _, err := tx.Exec(`UPDATE settings SET clear_track_number_on_upload = ? WHERE id = 1`, *input.ClearTrackNumberOnUpload); err != nil {
			tx.Rollback()
			return nil, err
		}
	}
	if input.ImportToAppleMusic != nil {
		if _, err := tx.Exec(`UPDATE settings SET import_to_apple_music = ? WHERE id = 1`, *input.ImportToAppleMusic); err != nil {
			tx.Rollback()
			return nil, err
		}
	}
	if input.AutomaticallyMakeSingles != nil {
		if _, err := tx.Exec(`UPDATE settings SET automatically_make_singles = ? WHERE id = 1`, *input.AutomaticallyMakeSingles); err != nil {
			tx.Rollback()
			return nil, err
		}
	}
	if _, err := tx.Exec(`UPDATE settings SET updated_at = ? WHERE id = 1`, now); err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return a.GetSettings()
}
