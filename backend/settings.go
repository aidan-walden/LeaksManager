package backend

import (
	"database/sql"
	"runtime"
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
		importToAppleMusic := runtime.GOOS == "darwin"
		if _, err := a.db.Exec(`INSERT INTO settings (id, clear_track_number_on_upload, import_to_apple_music, automatically_make_singles, updated_at) VALUES (1, 0, ?, 0, ?)`, importToAppleMusic, now); err != nil {
			return nil, err
		}
		return &Settings{
			ID:                 1,
			ImportToAppleMusic: importToAppleMusic,
			UpdatedAt:          now,
		}, nil
	}
	if err != nil {
		return nil, err
	}

	if runtime.GOOS != "darwin" {
		s.ImportToAppleMusic = false
	}
	s.UpdatedAt = updatedAt.Int64
	return &s, nil
}

func (a *App) UpdateSettings(input UpdateSettingsInput) (*Settings, error) {
	now := time.Now().Unix()
	if err := a.InTx(func(tx *sql.Tx) error {
		// Build dynamic update
		if input.ClearTrackNumberOnUpload != nil {
			if _, err := tx.Exec(`UPDATE settings SET clear_track_number_on_upload = ? WHERE id = 1`, *input.ClearTrackNumberOnUpload); err != nil {
				return err
			}
		}
		if input.ImportToAppleMusic != nil {
			importToAppleMusic := runtime.GOOS == "darwin" && *input.ImportToAppleMusic
			if _, err := tx.Exec(`UPDATE settings SET import_to_apple_music = ? WHERE id = 1`, importToAppleMusic); err != nil {
				return err
			}
		}
		if input.AutomaticallyMakeSingles != nil {
			if _, err := tx.Exec(`UPDATE settings SET automatically_make_singles = ? WHERE id = 1`, *input.AutomaticallyMakeSingles); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(`UPDATE settings SET updated_at = ? WHERE id = 1`, now); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}

	return a.GetSettings()
}
