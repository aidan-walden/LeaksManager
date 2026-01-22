package backend

import (
	"database/sql"
	"time"
)

// --- Artist CRUD ---

func (a *App) CreateArtist(input CreateArtistInput) (*Artist, error) {
	now := time.Now().Unix()
	result, err := a.db.Exec(
		`INSERT INTO artists (name, career_start_year, career_end_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		input.Name, input.CareerStartYear, input.CareerEndYear, now, now,
	)
	if err != nil {
		return nil, err
	}

	id, _ := result.LastInsertId()
	return &Artist{
		ID:              int(id),
		Name:            input.Name,
		CareerStartYear: input.CareerStartYear,
		CareerEndYear:   input.CareerEndYear,
		CreatedAt:       now,
		UpdatedAt:       now,
	}, nil
}

func (a *App) GetArtists() ([]Artist, error) {
	rows, err := a.db.Query(`SELECT id, name, image, career_start_year, career_end_year, created_at, updated_at, synced FROM artists`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var artists []Artist
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

func (a *App) GetArtistsWithRelations() ([]ArtistWithRelations, error) {
	artists, err := a.GetArtists()
	if err != nil {
		return nil, err
	}

	var result []ArtistWithRelations
	for _, art := range artists {
		albums, _ := a.getAlbumsByArtist(art.ID)
		songs, _ := a.getSongsByArtist(art.ID)
		result = append(result, ArtistWithRelations{
			Artist: art,
			Albums: albums,
			Songs:  songs,
		})
	}
	return result, nil
}

func (a *App) FindArtistByName(name string) (*Artist, error) {
	var art Artist
	var createdAt, updatedAt sql.NullInt64
	err := a.db.QueryRow(
		`SELECT id, name, image, career_start_year, career_end_year, created_at, updated_at, synced FROM artists WHERE LOWER(name) = LOWER(?)`,
		name,
	).Scan(&art.ID, &art.Name, &art.Image, &art.CareerStartYear, &art.CareerEndYear, &createdAt, &updatedAt, &art.Synced)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	art.CreatedAt = createdAt.Int64
	art.UpdatedAt = updatedAt.Int64
	return &art, nil
}

func (a *App) getAlbumsByArtist(artistID int) ([]Album, error) {
	rows, err := a.db.Query(`
		SELECT a.id, a.name, a.artwork_path, a.genre, a.year, a.created_at, a.updated_at, a.synced
		FROM albums a
		JOIN album_artists aa ON a.id = aa.album_id
		WHERE aa.artist_id = ?
		ORDER BY aa."order"
	`, artistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var albums []Album
	for rows.Next() {
		var alb Album
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&alb.ID, &alb.Name, &alb.ArtworkPath, &alb.Genre, &alb.Year, &createdAt, &updatedAt, &alb.Synced)
		if err != nil {
			return nil, err
		}
		alb.CreatedAt = createdAt.Int64
		alb.UpdatedAt = updatedAt.Int64
		albums = append(albums, alb)
	}
	return albums, nil
}

func (a *App) getSongsByArtist(artistID int) ([]Song, error) {
	rows, err := a.db.Query(`
		SELECT s.id, s.name, s.album_id, s.artwork_path, s.genre, s.year, s.track_number, s.duration, s.filepath, s.file_type, s.created_at, s.updated_at, s.synced, s.apple_music_id
		FROM songs s
		JOIN song_artists sa ON s.id = sa.song_id
		WHERE sa.artist_id = ?
		ORDER BY sa."order"
	`, artistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var songs []Song
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
