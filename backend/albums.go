package backend

import (
	"database/sql"
	"fmt"
	"time"
)

// --- Album CRUD ---

func (a *App) CreateAlbum(input CreateAlbumInput) (*Album, error) {
	if len(input.ArtistIDs) == 0 {
		return nil, fmt.Errorf("album must have at least one artist")
	}

	now := time.Now().Unix()
	tx, err := a.db.Begin()
	if err != nil {
		return nil, err
	}

	result, err := tx.Exec(
		`INSERT INTO albums (name, genre, year, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		input.Name, input.Genre, input.Year, now, now,
	)
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	albumID, err := result.LastInsertId()
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	// Link artists
	for i, artistID := range input.ArtistIDs {
		_, err := tx.Exec(
			`INSERT INTO album_artists (album_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
			albumID, artistID, i, now,
		)
		if err != nil {
			tx.Rollback()
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &Album{
		ID:        int(albumID),
		Name:      input.Name,
		Genre:     input.Genre,
		Year:      input.Year,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (a *App) UpdateAlbum(input UpdateAlbumInput) error {
	now := time.Now().Unix()
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}

	// Update album
	_, err = tx.Exec(
		`UPDATE albums SET name = COALESCE(?, name), genre = ?, year = ?, updated_at = ? WHERE id = ?`,
		input.Name, input.Genre, input.Year, now, input.ID,
	)
	if err != nil {
		tx.Rollback()
		return err
	}

	// Update artist links
	if len(input.ArtistIDs) > 0 {
		if _, err := tx.Exec(`DELETE FROM album_artists WHERE album_id = ?`, input.ID); err != nil {
			tx.Rollback()
			return err
		}
		for i, artistID := range input.ArtistIDs {
			if _, err := tx.Exec(
				`INSERT INTO album_artists (album_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
				input.ID, artistID, i, now,
			); err != nil {
				tx.Rollback()
				return err
			}
		}
	}

	return tx.Commit()
}

func (a *App) DeleteAlbum(albumID int) error {
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}

	// Unlink songs
	_, err = tx.Exec(`UPDATE songs SET album_id = NULL WHERE album_id = ?`, albumID)
	if err != nil {
		tx.Rollback()
		return err
	}

	// Delete album artist links
	_, err = tx.Exec(`DELETE FROM album_artists WHERE album_id = ?`, albumID)
	if err != nil {
		tx.Rollback()
		return err
	}

	// Delete album
	_, err = tx.Exec(`DELETE FROM albums WHERE id = ?`, albumID)
	if err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

func (a *App) GetAlbumsWithSongs(limit, offset int) ([]AlbumWithSongs, error) {
	rows, err := a.db.Query(`
		SELECT id, name, artwork_path, genre, year, created_at, updated_at, synced
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
		err := rows.Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &createdAt, &updatedAt, &alb.Synced)
		if err != nil {
			return nil, err
		}
		alb.CreatedAt = createdAt.Int64
		alb.UpdatedAt = updatedAt.Int64

		// Get artists
		artists, _ := a.getArtistsForAlbum(alb.ID)
		// Get songs
		songs, _ := a.getSongsForAlbum(alb.ID)

		albums = append(albums, AlbumWithSongs{
			Album:   alb,
			Artists: artists,
			Songs:   songs,
		})
	}
	return albums, nil
}

func (a *App) GetAlbumWithArtists(albumID int) (*AlbumWithArtists, error) {
	var alb Album
	var createdAt, updatedAt sql.NullInt64
	err := a.db.QueryRow(`
		SELECT id, name, artwork_path, genre, year, created_at, updated_at, synced
		FROM albums WHERE id = ?
	`, albumID).Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &createdAt, &updatedAt, &alb.Synced)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	alb.CreatedAt = createdAt.Int64
	alb.UpdatedAt = updatedAt.Int64

	artists, _ := a.getArtistsForAlbum(albumID)
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
	return songs, nil
}

func (a *App) FindAlbumByName(name string) (*Album, error) {
	var alb Album
	var createdAt, updatedAt sql.NullInt64
	err := a.db.QueryRow(
		`SELECT id, name, artwork_path, genre, year, created_at, updated_at, synced FROM albums WHERE LOWER(name) = LOWER(?)`,
		name,
	).Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &createdAt, &updatedAt, &alb.Synced)
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
