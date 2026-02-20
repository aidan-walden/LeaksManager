package backend

import (
	"database/sql"
	"os"
	"strings"
	"time"
)

// --- Song CRUD ---

func (a *App) CreateSong(input CreateSongInput) (*Song, error) {
	now := time.Now().Unix()
	result, err := a.db.Exec(
		`INSERT INTO songs (name, filepath, album_id, artwork_path, genre, year, track_number, duration, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		input.Name, input.Filepath, input.AlbumID, input.ArtworkPath, input.Genre, input.Year, input.TrackNumber, input.Duration, now, now,
	)
	if err != nil {
		return nil, err
	}

	songID, _ := result.LastInsertId()

	// Link artists
	for i, artistID := range input.ArtistIDs {
		a.db.Exec(
			`INSERT INTO song_artists (song_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
			songID, artistID, i, now,
		)
	}

	// Link producers
	for i, producerID := range input.ProducerIDs {
		a.db.Exec(
			`INSERT INTO song_producers (song_id, producer_id, "order", created_at) VALUES (?, ?, ?, ?)`,
			songID, producerID, i, now,
		)
	}

	return &Song{
		ID:          int(songID),
		Name:        input.Name,
		Filepath:    input.Filepath,
		AlbumID:     input.AlbumID,
		ArtworkPath: input.ArtworkPath,
		Genre:       input.Genre,
		Year:        input.Year,
		TrackNumber: input.TrackNumber,
		Duration:    input.Duration,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (a *App) UpdateSong(input UpdateSongInput) error {
	now := time.Now().Unix()

	// Update song
	_, err := a.db.Exec(
		`UPDATE songs SET name = COALESCE(?, name), album_id = ?, track_number = ?, updated_at = ? WHERE id = ?`,
		input.Name, input.AlbumID, input.TrackNumber, now, input.ID,
	)
	if err != nil {
		return err
	}

	// Update artist links
	if input.ArtistIDs != nil {
		a.db.Exec(`DELETE FROM song_artists WHERE song_id = ?`, input.ID)
		for i, artistID := range input.ArtistIDs {
			a.db.Exec(
				`INSERT INTO song_artists (song_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`,
				input.ID, artistID, i, now,
			)
		}
	}

	// Update producer links
	if input.ProducerIDs != nil {
		a.db.Exec(`DELETE FROM song_producers WHERE song_id = ?`, input.ID)
		for i, producerID := range input.ProducerIDs {
			a.db.Exec(
				`INSERT INTO song_producers (song_id, producer_id, "order", created_at) VALUES (?, ?, ?, ?)`,
				input.ID, producerID, i, now,
			)
		}
	}

	return nil
}

func (a *App) DeleteSong(songID int) error {
	// Get filepath first
	var songFilepath string
	err := a.db.QueryRow(`SELECT filepath FROM songs WHERE id = ?`, songID).Scan(&songFilepath)
	if err != nil {
		return err
	}

	// Delete song from DB
	_, err = a.db.Exec(`DELETE FROM songs WHERE id = ?`, songID)
	if err != nil {
		return err
	}

	// Delete file from disk
	if songFilepath != "" {
		if fullPath, pathErr := a.staticFilePath(songFilepath); pathErr == nil {
			os.Remove(fullPath)
		}
	}

	return nil
}

func (a *App) GetSongsReadable(limit, offset int) ([]SongReadable, error) {
	rows, err := a.db.Query(`
		SELECT id, name, album_id, artwork_path, genre, year, track_number, duration, filepath, file_type, created_at, updated_at, synced, apple_music_id
		FROM songs
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	songs := []SongReadable{}
	for rows.Next() {
		var song Song
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&song.ID, &song.Name, &song.AlbumID, &song.ArtworkPath, &song.Genre, &song.Year, &song.TrackNumber, &song.Duration, &song.Filepath, &song.FileType, &createdAt, &updatedAt, &song.Synced, &song.AppleMusicID)
		if err != nil {
			return nil, err
		}
		song.CreatedAt = createdAt.Int64
		song.UpdatedAt = updatedAt.Int64

		// Get artists
		artists, _ := a.getArtistsForSong(song.ID)
		artistNames := make([]string, len(artists))
		for i, art := range artists {
			artistNames[i] = art.Name
		}

		// Get producers
		producers, _ := a.getProducersForSong(song.ID)

		// Get album
		var album *Album
		if song.AlbumID != nil {
			album, _ = a.getAlbumByID(*song.AlbumID)
		}

		songs = append(songs, SongReadable{
			Song:      song,
			Artist:    strings.Join(artistNames, ", "),
			Artists:   artists,
			Producers: producers,
			Album:     album,
		})
	}
	return songs, nil
}

func (a *App) GetSongsCount() (int, error) {
	var count int
	err := a.db.QueryRow(`SELECT COUNT(*) FROM songs`).Scan(&count)
	return count, err
}

func (a *App) getArtistsForSong(songID int) ([]Artist, error) {
	rows, err := a.db.Query(`
		SELECT ar.id, ar.name, ar.image, ar.career_start_year, ar.career_end_year, ar.created_at, ar.updated_at, ar.synced
		FROM artists ar
		JOIN song_artists sa ON ar.id = sa.artist_id
		WHERE sa.song_id = ?
		ORDER BY sa."order"
	`, songID)
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

func (a *App) getProducersForSong(songID int) ([]Producer, error) {
	rows, err := a.db.Query(`
		SELECT p.id, p.name, p.created_at, p.updated_at
		FROM producers p
		JOIN song_producers sp ON p.id = sp.producer_id
		WHERE sp.song_id = ?
		ORDER BY sp."order"
	`, songID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	producers := []Producer{}
	for rows.Next() {
		var prod Producer
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&prod.ID, &prod.Name, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		prod.CreatedAt = createdAt.Int64
		prod.UpdatedAt = updatedAt.Int64
		producers = append(producers, prod)
	}
	return producers, nil
}

func (a *App) getAlbumByID(albumID int) (*Album, error) {
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
	return &alb, nil
}
