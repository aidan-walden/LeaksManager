package backend

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// --- Album CRUD ---

func (a *App) CreateAlbum(input CreateAlbumInput) (*Album, error) {
	if len(input.ArtistIDs) == 0 {
		return nil, fmt.Errorf("album must have at least one artist")
	}

	now := time.Now().Unix()
	var albumID int64
	err := a.InTx(func(tx *sql.Tx) error {
		result, err := tx.Exec(
			`INSERT INTO albums (name, genre, year, is_single, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
			input.Name, input.Genre, input.Year, input.IsSingle, now, now,
		)
		if err != nil {
			return err
		}

		albumID, err = result.LastInsertId()
		if err != nil {
			return err
		}

		// Link artists
		for i, artistID := range input.ArtistIDs {
			if _, err := tx.Exec(
				`INSERT INTO album_artists (album_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
				albumID, artistID, i, now,
			); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return &Album{
		ID:        int(albumID),
		Name:      input.Name,
		Genre:     input.Genre,
		Year:      input.Year,
		IsSingle:  input.IsSingle,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (a *App) UpdateAlbum(input UpdateAlbumInput) error {
	now := time.Now().Unix()
	return a.InTx(func(tx *sql.Tx) error {
		// Update album
		if _, err := tx.Exec(
			`UPDATE albums SET name = COALESCE(?, name), genre = ?, year = ?, updated_at = ? WHERE id = ?`,
			input.Name, input.Genre, input.Year, now, input.ID,
		); err != nil {
			return err
		}

		// Update artist links
		if len(input.ArtistIDs) > 0 {
			if _, err := tx.Exec(`DELETE FROM album_artists WHERE album_id = ?`, input.ID); err != nil {
				return err
			}
			for i, artistID := range input.ArtistIDs {
				if _, err := tx.Exec(
					`INSERT INTO album_artists (album_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
					input.ID, artistID, i, now,
				); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func (a *App) DeleteAlbum(albumID int) error {
	return a.InTx(func(tx *sql.Tx) error {
		// Unlink songs
		if _, err := tx.Exec(`UPDATE songs SET album_id = NULL WHERE album_id = ?`, albumID); err != nil {
			return err
		}

		// Delete album artist links
		if _, err := tx.Exec(`DELETE FROM album_artists WHERE album_id = ?`, albumID); err != nil {
			return err
		}

		// Delete album
		if _, err := tx.Exec(`DELETE FROM albums WHERE id = ?`, albumID); err != nil {
			return err
		}
		return nil
	})
}

func (a *App) GetAlbumsWithSongs(limit, offset int) ([]AlbumWithSongs, error) {
	rows, err := a.db.Query(`
		SELECT id, name, artwork_path, genre, year, is_single, created_at, updated_at, synced
		FROM albums
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	albums := []AlbumWithSongs{}
	for rows.Next() {
		var alb Album
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &alb.IsSingle, &createdAt, &updatedAt, &alb.Synced)
		if err != nil {
			return nil, err
		}
		alb.CreatedAt = createdAt.Int64
		alb.UpdatedAt = updatedAt.Int64

		artists, err := a.getArtistsForAlbum(alb.ID)
		if err != nil {
			return nil, fmt.Errorf("load artists for album %d: %w", alb.ID, err)
		}
		songs, err := a.getSongsForAlbum(alb.ID)
		if err != nil {
			return nil, fmt.Errorf("load songs for album %d: %w", alb.ID, err)
		}

		albums = append(albums, AlbumWithSongs{
			Album:   alb,
			Artists: artists,
			Songs:   songs,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return albums, nil
}

func (a *App) GetAlbumWithArtists(albumID int) (*AlbumWithArtists, error) {
	var alb Album
	var createdAt, updatedAt sql.NullInt64
	err := a.db.QueryRow(`
		SELECT id, name, artwork_path, genre, year, is_single, created_at, updated_at, synced
		FROM albums WHERE id = ?
	`, albumID).Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &alb.IsSingle, &createdAt, &updatedAt, &alb.Synced)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	alb.CreatedAt = createdAt.Int64
	alb.UpdatedAt = updatedAt.Int64

	artists, err := a.getArtistsForAlbum(albumID)
	if err != nil {
		return nil, fmt.Errorf("load artists for album %d: %w", albumID, err)
	}
	return &AlbumWithArtists{Album: alb, Artists: artists}, nil
}

func (a *App) getArtistsForAlbum(albumID int) ([]Artist, error) {
	rows, err := a.db.Query(`
		SELECT ar.id, ar.name, ar.image, ar.career_start_year, ar.career_end_year, ar.created_at, ar.updated_at, ar.synced
		FROM artists ar
		JOIN album_artists aa ON ar.id = aa.artist_id
		WHERE aa.album_id = ?
		ORDER BY aa."order"
	`, albumID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	artists := []Artist{}
	for rows.Next() {
		var art Artist
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&art.ID, &art.Name, &art.Image, &art.CareerStartYear, &art.CareerEndYear, &createdAt, &updatedAt, &art.Synced)
		if err != nil {
			return nil, err
		}
		art.CreatedAt = createdAt.Int64
		art.UpdatedAt = updatedAt.Int64
		artists = append(artists, art)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return artists, nil
}

func (a *App) getSongsForAlbum(albumID int) ([]Song, error) {
	rows, err := a.db.Query(`
		SELECT id, name, album_id, artwork_path, genre, year, track_number, duration, filepath, file_type, created_at, updated_at, synced, apple_music_id
		FROM songs WHERE album_id = ?
		ORDER BY track_number, created_at
	`, albumID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	songs := []Song{}
	for rows.Next() {
		var song Song
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&song.ID, &song.Name, &song.AlbumID, &song.ArtworkPath, &song.Genre, &song.Year, &song.TrackNumber, &song.Duration, &song.Filepath, &song.FileType, &createdAt, &updatedAt, &song.Synced, &song.AppleMusicID)
		if err != nil {
			return nil, err
		}
		song.CreatedAt = createdAt.Int64
		song.UpdatedAt = updatedAt.Int64
		songs = append(songs, song)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return songs, nil
}

// AlbumResolutionOpts carries optional knobs for ResolveOrCreateAlbum.
type AlbumResolutionOpts struct {
	// IsSingle forces is_single=1 when creating, and upgrades a matched
	// album to is_single=1 if it was previously not a single.
	IsSingle bool
	// InheritArtworkFromSongID, when set and a new album is created, copies
	// the referenced song's artwork_path onto the new album.
	InheritArtworkFromSongID *int
}

// ResolveOrCreateAlbum finds an album by case-insensitive name with the
// exact ordered artist set, or creates a new one. Returns (album, created, err).
// An empty trimmed name returns (nil, false, nil).
func (a *App) ResolveOrCreateAlbum(name string, artistIDs []int, opts AlbumResolutionOpts) (*Album, bool, error) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, false, nil
	}

	var resultAlbum *Album
	var created bool
	now := time.Now().Unix()

	err := a.InTx(func(tx *sql.Tx) error {
		// gather candidates by case-insensitive name
		rows, err := tx.Query(
			`SELECT id, name, artwork_path, genre, year, is_single, created_at, updated_at, synced
			 FROM albums WHERE LOWER(name) = LOWER(?)`,
			trimmedName,
		)
		if err != nil {
			return err
		}
		candidates := []Album{}
		for rows.Next() {
			var alb Album
			var createdAt, updatedAt sql.NullInt64
			if err := rows.Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &alb.IsSingle, &createdAt, &updatedAt, &alb.Synced); err != nil {
				rows.Close()
				return err
			}
			alb.CreatedAt = createdAt.Int64
			alb.UpdatedAt = updatedAt.Int64
			candidates = append(candidates, alb)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		// find a candidate whose ordered artist set matches
		for _, alb := range candidates {
			match, err := artistSetMatchesTx(tx, alb.ID, artistIDs)
			if err != nil {
				return err
			}
			if match {
				if opts.IsSingle && !alb.IsSingle {
					if _, err := tx.Exec(`UPDATE albums SET is_single = 1, updated_at = ? WHERE id = ?`, now, alb.ID); err != nil {
						return err
					}
					alb.IsSingle = true
					alb.UpdatedAt = now
				}
				resultAlbum = &alb
				return nil
			}
		}

		// no match -> create
		if len(artistIDs) == 0 {
			return fmt.Errorf("album must have at least one artist")
		}

		var artworkPath *string
		if opts.InheritArtworkFromSongID != nil {
			if err := tx.QueryRow(`SELECT artwork_path FROM songs WHERE id = ?`, *opts.InheritArtworkFromSongID).Scan(&artworkPath); err != nil && err != sql.ErrNoRows {
				return err
			}
		}

		result, err := tx.Exec(
			`INSERT INTO albums (name, artwork_path, is_single, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
			trimmedName, artworkPath, opts.IsSingle, now, now,
		)
		if err != nil {
			return err
		}
		newID, err := result.LastInsertId()
		if err != nil {
			return err
		}

		for i, artistID := range artistIDs {
			if _, err := tx.Exec(
				`INSERT INTO album_artists (album_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
				int(newID), artistID, i, now,
			); err != nil {
				return err
			}
		}

		resultAlbum = &Album{
			ID:          int(newID),
			Name:        trimmedName,
			ArtworkPath: artworkPath,
			IsSingle:    opts.IsSingle,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		created = true
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return resultAlbum, created, nil
}

// artistSetMatchesTx returns true if the album's ordered artist list
// equals the given artistIDs exactly.
func artistSetMatchesTx(tx *sql.Tx, albumID int, artistIDs []int) (bool, error) {
	rows, err := tx.Query(
		`SELECT artist_id FROM album_artists WHERE album_id = ? ORDER BY "order"`,
		albumID,
	)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	existing := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return false, err
		}
		existing = append(existing, id)
	}
	if err := rows.Err(); err != nil {
		return false, err
	}

	if len(existing) != len(artistIDs) {
		return false, nil
	}
	for i, id := range existing {
		if id != artistIDs[i] {
			return false, nil
		}
	}
	return true, nil
}

func (a *App) FindAlbumByName(name string) (*Album, error) {
	var alb Album
	var createdAt, updatedAt sql.NullInt64
	err := a.db.QueryRow(
		`SELECT id, name, artwork_path, genre, year, is_single, created_at, updated_at, synced FROM albums WHERE LOWER(name) = LOWER(?)`,
		name,
	).Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &alb.IsSingle, &createdAt, &updatedAt, &alb.Synced)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	alb.CreatedAt = createdAt.Int64
	alb.UpdatedAt = updatedAt.Int64
	return &alb, nil
}
