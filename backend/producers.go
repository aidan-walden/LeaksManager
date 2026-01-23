package backend

import (
	"database/sql"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
)

// --- Producer CRUD ---

func (a *App) CreateProducerWithAliases(input CreateProducerInput) (*Producer, error) {
	now := time.Now().Unix()

	// Check alias uniqueness
	for _, alias := range input.Aliases {
		var exists int
		a.db.QueryRow(`SELECT COUNT(*) FROM producer_aliases WHERE LOWER(alias) = LOWER(?)`, alias.Name).Scan(&exists)
		if exists > 0 {
			return nil, fmt.Errorf("alias \"%s\" already exists for another producer", alias.Name)
		}
	}

	result, err := a.db.Exec(
		`INSERT INTO producers (name, created_at, updated_at) VALUES (?, ?, ?)`, 
		input.Name, now, now,
	)
	if err != nil {
		return nil, err
	}

	producerID, _ := result.LastInsertId()

	// Create aliases
	for _, alias := range input.Aliases {
		aliasResult, err := a.db.Exec(
			`INSERT INTO producer_aliases (producer_id, alias, created_at) VALUES (?, ?, ?)`, 
			producerID, alias.Name, now,
		)
		if err != nil {
			return nil, err
		}

		aliasID, _ := aliasResult.LastInsertId()

		// Create artist restrictions
		for _, artistID := range alias.ArtistIDs {
			a.db.Exec(
				`INSERT INTO producer_alias_artists (alias_id, artist_id, created_at) VALUES (?, ?, ?)`, 
				aliasID, artistID, now,
			)
		}
	}

	return &Producer{
		ID:        int(producerID),
		Name:      input.Name,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (a *App) UpdateProducerWithAliases(input UpdateProducerInput) (*Producer, error) {
	now := time.Now().Unix()

	// Check alias uniqueness (excluding current producer)
	for _, alias := range input.Aliases {
		var conflictID int
		err := a.db.QueryRow(`
			SELECT pa.producer_id FROM producer_aliases pa
			WHERE LOWER(pa.alias) = LOWER(?) AND pa.producer_id != ?
		`, alias.Name, input.ID).Scan(&conflictID)
		if err == nil {
			return nil, fmt.Errorf("alias \"%s\" already exists for another producer", alias.Name)
		}
	}

	// Update producer name
	_, err := a.db.Exec(`UPDATE producers SET name = ?, updated_at = ? WHERE id = ?`, input.Name, now, input.ID)
	if err != nil {
		return nil, err
	}

	// Delete existing aliases and their artist restrictions

rows, _ := a.db.Query(`SELECT id FROM producer_aliases WHERE producer_id = ?`, input.ID)
	var aliasIDs []int
	for rows.Next() {
		var id int
		rows.Scan(&id)
		aliasIDs = append(aliasIDs, id)
	}

rows.Close()

	for _, aliasID := range aliasIDs {
		a.db.Exec(`DELETE FROM producer_alias_artists WHERE alias_id = ?`, aliasID)
	}
	a.db.Exec(`DELETE FROM producer_aliases WHERE producer_id = ?`, input.ID)

	// Create new aliases
	for _, alias := range input.Aliases {
		aliasResult, err := a.db.Exec(
			`INSERT INTO producer_aliases (producer_id, alias, created_at) VALUES (?, ?, ?)`, 
			input.ID, alias.Name, now,
		)
		if err != nil {
			return nil, err
		}

		aliasID, _ := aliasResult.LastInsertId()

		for _, artistID := range alias.ArtistIDs {
			a.db.Exec(
				`INSERT INTO producer_alias_artists (alias_id, artist_id, created_at) VALUES (?, ?, ?)`, 
				aliasID, artistID, now,
			)
		}
	}

	return &Producer{
		ID:        input.ID,
		Name:      input.Name,
		CreatedAt: now, // Note: This is not accurate, but we don't query for original
		UpdatedAt: now,
	}, nil
}

func (a *App) DeleteProducer(producerID int) error {
	_, err := a.db.Exec(`DELETE FROM producers WHERE id = ?`, producerID)
	return err
}

func (a *App) GetProducersWithAliases() ([]ProducerWithAliases, error) {

rows, err := a.db.Query(`SELECT id, name, created_at, updated_at FROM producers`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	producers := []ProducerWithAliases{}
	for rows.Next() {
		var prod Producer
		var createdAt, updatedAt sql.NullInt64
		err := rows.Scan(&prod.ID, &prod.Name, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		prod.CreatedAt = createdAt.Int64
		prod.UpdatedAt = updatedAt.Int64

		aliases, _ := a.getAliasesForProducer(prod.ID)
		songs, _ := a.getSongsForProducer(prod.ID)

		producers = append(producers, ProducerWithAliases{
			Producer: prod,
			Aliases:  aliases,
			Songs:    songs,
		})
	}
	return producers, nil
}

func (a *App) getAliasesForProducer(producerID int) ([]ProducerAliasWithArtists, error) {

rows, err := a.db.Query(`
		SELECT id, producer_id, alias, created_at FROM producer_aliases WHERE producer_id = ?
	`, producerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	aliases := []ProducerAliasWithArtists{}
	for rows.Next() {
		var alias ProducerAlias
		var createdAt sql.NullInt64
		err := rows.Scan(&alias.ID, &alias.ProducerID, &alias.Alias, &createdAt)
		if err != nil {
			return nil, err
		}
		alias.CreatedAt = createdAt.Int64

		// Get artist IDs for this alias
		artistRows, _ := a.db.Query(`SELECT artist_id FROM producer_alias_artists WHERE alias_id = ?`, alias.ID)
		artistIDs := []int{}
		for artistRows.Next() {
			var artistID int
			artistRows.Scan(&artistID)
			artistIDs = append(artistIDs, artistID)
		}
		artistRows.Close()

		aliases = append(aliases, ProducerAliasWithArtists{
			ProducerAlias: alias,
			ArtistIDs:     artistIDs,
		})
	}
	return aliases, nil
}

func (a *App) getSongsForProducer(producerID int) ([]Song, error) {

rows, err := a.db.Query(`
		SELECT s.id, s.name, s.album_id, s.artwork_path, s.genre, s.year, s.track_number, s.duration, s.filepath, s.file_type, s.created_at, s.updated_at, s.synced, s.apple_music_id
		FROM songs s
		JOIN song_producers sp ON s.id = sp.song_id
		WHERE sp.producer_id = ?
	`, producerID)
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

// WriteProducerMetadata writes metadata to all songs by a producer
func (a *App) WriteProducerMetadata(producerID int) (BatchResult, error) {

rows, err := a.db.Query(`SELECT song_id FROM song_producers WHERE producer_id = ?`, producerID)
	if err != nil {
		return BatchResult{}, err
	}
	defer rows.Close()

	songIDs := []int{}
	for rows.Next() {
		var id int
		rows.Scan(&id)
		songIDs = append(songIDs, id)
	}

	// Parallel processing
	results := make([]SongProcessingResult, len(songIDs))
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 4)

	for i, id := range songIDs {
		wg.Add(1)
		go func(index int, sID int) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			err := a.writeSongMetadataInternal(sID)
			res := SongProcessingResult{SongID: sID, Success: true}
			if err != nil {
				res.Success = false
				res.Error = err.Error()
			}
			results[index] = res
		}(i, id)
	}

	wg.Wait()

	successCount := 0
	failCount := 0
	for _, r := range results {
		if r.Success {
			successCount++
		} else {
			failCount++
		}
	}

	return BatchResult{
		Success:        true,
		Message:        fmt.Sprintf("Processed producer %d", producerID),
		SongsProcessed: successCount,
		SongsFailed:    failCount,
		Results:        results,
	}, nil
}

// MatchProducersFromFilename matches producers based on filename patterns
func (a *App) MatchProducersFromFilename(filename string, songArtistIDs []int) ([]int, error) {
	// Remove file extension and normalize
	nameWithoutExt := strings.ToLower(regexp.MustCompile(`\.[^/.]+$`).ReplaceAllString(filename, ""))

	// Get all producers with aliases
	producers, err := a.GetProducersWithAliases()
	if err != nil {
		return nil, err
	}

	// Build searchable terms
	type searchTerm struct {
		term          string
		producerID    int
		isAlias       bool
		aliasArtistIDs []int
	}
	searchableTerms := []searchTerm{}

	for _, prod := range producers {
		// Add producer name
		searchableTerms = append(searchableTerms, searchTerm{
			term:       strings.ToLower(prod.Name),
			producerID: prod.ID,
			isAlias:    false,
		})

		// Add aliases
		for _, alias := range prod.Aliases {
			searchableTerms = append(searchableTerms, searchTerm{
				term:           strings.ToLower(alias.Alias),
				producerID:     prod.ID,
				isAlias:        true,
				aliasArtistIDs: alias.ArtistIDs,
			})
		}
	}

	// Sort by length (longest first)
	for i := 0; i < len(searchableTerms)-1; i++ {
		for j := i + 1; j < len(searchableTerms); j++ {
			if len(searchableTerms[j].term) > len(searchableTerms[i].term) {
				searchableTerms[i], searchableTerms[j] = searchableTerms[j], searchableTerms[i]
			}
		}
	}

	matchedIDs := make(map[int]bool)
	consumedRanges := make([]struct{ start, end int }, 0)

	isArtistContextValid := func(aliasArtistIDs []int) bool {
		if len(aliasArtistIDs) == 0 {
			return true // Global alias
		}
		if len(songArtistIDs) == 0 {
			return false
		}
		for _, aid := range songArtistIDs {
			for _, aaid := range aliasArtistIDs {
				if aid == aaid {
					return true
				}
			}
		}
		return false
	}

	isRangeConsumed := func(start, end int) bool {
		for _, r := range consumedRanges {
			if (start >= r.start && start < r.end) || (end > r.start && end <= r.end) || (start <= r.start && end >= r.end) {
				return true
			}
		}
		return false
	}

	// Pass 1: exact matches with word boundaries
	for _, st := range searchableTerms {
		if st.isAlias && !isArtistContextValid(st.aliasArtistIDs) {
			continue
		}

		escapedTerm := regexp.QuoteMeta(st.term)
		re := regexp.MustCompile(`\b` + escapedTerm + `\b`)
		matches := re.FindAllStringIndex(nameWithoutExt, -1)

		for _, match := range matches {
			if !isRangeConsumed(match[0], match[1]) {
				matchedIDs[st.producerID] = true
				consumedRanges = append(consumedRanges, struct{ start, end int }{match[0], match[1]})
			}
		}
	}

	// Pass 2: partial matches
	for _, st := range searchableTerms {
		if st.isAlias && !isArtistContextValid(st.aliasArtistIDs) {
			continue
		}

		idx := strings.Index(nameWithoutExt, st.term)
		if idx != -1 {
			start := idx
			end := idx + len(st.term)
			if !isRangeConsumed(start, end) {
				matchedIDs[st.producerID] = true
				consumedRanges = append(consumedRanges, struct{ start, end int }{start, end})
			}
		}
	}

	result := []int{}
	for id := range matchedIDs {
		result = append(result, id)
	}
	return result, nil
}
