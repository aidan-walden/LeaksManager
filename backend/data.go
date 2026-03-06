package backend

import (
	"runtime"
)

// --- Data Loading ---

// GetInitialData replaces +layout.server.ts load function
func (a *App) GetInitialData() (*InitialData, error) {
	const songsPerPage = 25
	const albumsPerPage = 25

	songs, err := a.GetSongsReadable(songsPerPage, 0)
	if err != nil {
		return nil, err
	}

	songsCount, err := a.GetSongsCount()
	if err != nil {
		return nil, err
	}

	albums, err := a.GetAlbumsWithSongs(albumsPerPage, 0)
	if err != nil {
		return nil, err
	}

	artists, err := a.GetArtistsWithRelations()
	if err != nil {
		return nil, err
	}

	producers, err := a.GetProducersWithAliases()
	if err != nil {
		return nil, err
	}

	settings, err := a.GetSettings()
	if err != nil {
		return nil, err
	}

	hasUnsyncedChanges, _ := a.checkUnsyncedChanges()

	return &InitialData{
		Songs:      songs,
		SongsCount: songsCount,
		Albums:     albums,
		Artists:    artists,
		Producers:  producers,
		Settings:   *settings,
		IsMac:      runtime.GOOS == "darwin",
		Limits: Limits{
			SongsPerPage:  songsPerPage,
			AlbumsPerPage: albumsPerPage,
		},
		HasUnsyncedChanges: hasUnsyncedChanges,
	}, nil
}

func (a *App) checkUnsyncedChanges() (bool, error) {
	settings, err := a.GetSettings()
	if err != nil {
		return false, err
	}
	if !settings.ImportToAppleMusic {
		return false, nil
	}

	var count int
	err = a.db.QueryRow("SELECT COUNT(*) FROM songs WHERE synced = 0").Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
