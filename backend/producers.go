package backend

import (
	"database/sql"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Pattern is a flat producer-matching term: either a producer's name or one of its aliases.
// AliasArtistIDs is empty for producer names and for unrestricted aliases.
type Pattern struct {
	Term           string
	ProducerID     int
	IsAlias        bool
	AliasArtistIDs []int
}

// --- Producer CRUD ---

func (a *App) CreateProducerWithAliases(input CreateProducerInput) (*Producer, error) {
	now := time.Now().Unix()
	var producerID int64
	err := a.InTx(func(tx *sql.Tx) error {
		// Check alias uniqueness
		for _, alias := range input.Aliases {
			var exists int
			if err := tx.QueryRow(`SELECT COUNT(*) FROM producer_aliases WHERE LOWER(alias) = LOWER(?)`, alias.Name).Scan(&exists); err != nil {
				return err
			}
			if exists > 0 {
				return fmt.Errorf("alias \"%s\" already exists for another producer", alias.Name)
			}
		}

		result, err := tx.Exec(
			`INSERT INTO producers (name, created_at, updated_at) VALUES (?, ?, ?)`,
			input.Name, now, now,
		)
		if err != nil {
			return err
		}

		producerID, err = result.LastInsertId()
		if err != nil {
			return err
		}

		// Create aliases
		for _, alias := range input.Aliases {
			aliasResult, err := tx.Exec(
				`INSERT INTO producer_aliases (producer_id, alias, created_at) VALUES (?, ?, ?)`,
				producerID, alias.Name, now,
			)
			if err != nil {
				return err
			}

			aliasID, err := aliasResult.LastInsertId()
			if err != nil {
				return err
			}

			// Create artist restrictions
			for _, artistID := range alias.ArtistIDs {
				if _, err := tx.Exec(
					`INSERT INTO producer_alias_artists (alias_id, artist_id, created_at) VALUES (?, ?, ?)`,
					aliasID, artistID, now,
				); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
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
	var createdAt int64
	err := a.InTx(func(tx *sql.Tx) error {
		if err := tx.QueryRow(`SELECT created_at FROM producers WHERE id = ?`, input.ID).Scan(&createdAt); err != nil {
			return err
		}

		// Check alias uniqueness (excluding current producer)
		for _, alias := range input.Aliases {
			var conflictID int
			err := tx.QueryRow(`
				SELECT pa.producer_id FROM producer_aliases pa
				WHERE LOWER(pa.alias) = LOWER(?) AND pa.producer_id != ?
			`, alias.Name, input.ID).Scan(&conflictID)
			if err == nil {
				return fmt.Errorf("alias \"%s\" already exists for another producer", alias.Name)
			}
			if err != nil && err != sql.ErrNoRows {
				return err
			}
		}

		// Update producer name
		if _, err := tx.Exec(`UPDATE producers SET name = ?, updated_at = ? WHERE id = ?`, input.Name, now, input.ID); err != nil {
			return err
		}

		// Delete existing aliases and their artist restrictions
		rows, err := tx.Query(`SELECT id FROM producer_aliases WHERE producer_id = ?`, input.ID)
		if err != nil {
			return err
		}
		aliasIDs := []int{}
		for rows.Next() {
			var id int
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			aliasIDs = append(aliasIDs, id)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		rows.Close()

		for _, aliasID := range aliasIDs {
			if _, err := tx.Exec(`DELETE FROM producer_alias_artists WHERE alias_id = ?`, aliasID); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(`DELETE FROM producer_aliases WHERE producer_id = ?`, input.ID); err != nil {
			return err
		}

		// Create new aliases
		for _, alias := range input.Aliases {
			aliasResult, err := tx.Exec(
				`INSERT INTO producer_aliases (producer_id, alias, created_at) VALUES (?, ?, ?)`,
				input.ID, alias.Name, now,
			)
			if err != nil {
				return err
			}

			aliasID, err := aliasResult.LastInsertId()
			if err != nil {
				return err
			}

			for _, artistID := range alias.ArtistIDs {
				if _, err := tx.Exec(
					`INSERT INTO producer_alias_artists (alias_id, artist_id, created_at) VALUES (?, ?, ?)`,
					aliasID, artistID, now,
				); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return &Producer{
		ID:        input.ID,
		Name:      input.Name,
		CreatedAt: createdAt,
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

		aliases, err := a.getAliasesForProducer(prod.ID)
		if err != nil {
			return nil, fmt.Errorf("load aliases for producer %d: %w", prod.ID, err)
		}
		songs, err := a.getSongsForProducer(prod.ID)
		if err != nil {
			return nil, fmt.Errorf("load songs for producer %d: %w", prod.ID, err)
		}

		producers = append(producers, ProducerWithAliases{
			Producer: prod,
			Aliases:  aliases,
			Songs:    songs,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
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
		artistRows, err := a.db.Query(`SELECT artist_id FROM producer_alias_artists WHERE alias_id = ?`, alias.ID)
		if err != nil {
			return nil, err
		}
		artistIDs := []int{}
		for artistRows.Next() {
			var artistID int
			if err := artistRows.Scan(&artistID); err != nil {
				artistRows.Close()
				return nil, err
			}
			artistIDs = append(artistIDs, artistID)
		}
		if err := artistRows.Err(); err != nil {
			artistRows.Close()
			return nil, err
		}
		artistRows.Close()

		aliases = append(aliases, ProducerAliasWithArtists{
			ProducerAlias: alias,
			ArtistIDs:     artistIDs,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
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
	if err := rows.Err(); err != nil {
		return nil, err
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
		if err := rows.Scan(&id); err != nil {
			return BatchResult{}, err
		}
		songIDs = append(songIDs, id)
	}
	if err := rows.Err(); err != nil {
		return BatchResult{}, err
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

// LoadProducerPatterns loads all producer-matching patterns in one query (no N+1).
// Each producer contributes one row for its name and one row per alias; artist
// restrictions are aggregated via GROUP_CONCAT.
func (a *App) LoadProducerPatterns() ([]Pattern, error) {
	rows, err := a.db.Query(`
		SELECT p.id, p.name, pa.alias, GROUP_CONCAT(paa.artist_id)
		FROM producers p
		LEFT JOIN producer_aliases pa ON pa.producer_id = p.id
		LEFT JOIN producer_alias_artists paa ON paa.alias_id = pa.id
		GROUP BY p.id, pa.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// dedupe producer-name rows: producers with multiple aliases would repeat the name.
	seenName := make(map[int]bool)
	patterns := []Pattern{}
	for rows.Next() {
		var producerID int
		var name string
		var alias sql.NullString
		var artistIDs sql.NullString
		if err := rows.Scan(&producerID, &name, &alias, &artistIDs); err != nil {
			return nil, err
		}
		if !seenName[producerID] {
			patterns = append(patterns, Pattern{
				Term:       strings.ToLower(name),
				ProducerID: producerID,
				IsAlias:    false,
			})
			seenName[producerID] = true
		}
		if alias.Valid {
			ids := []int{}
			if artistIDs.Valid && artistIDs.String != "" {
				for _, s := range strings.Split(artistIDs.String, ",") {
					var id int
					if _, err := fmt.Sscanf(s, "%d", &id); err == nil {
						ids = append(ids, id)
					}
				}
			}
			patterns = append(patterns, Pattern{
				Term:           strings.ToLower(alias.String),
				ProducerID:     producerID,
				IsAlias:        true,
				AliasArtistIDs: ids,
			})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return patterns, nil
}

// MatchPatterns runs the pure matching algorithm: word-boundary scan, artist-restriction
// filter, dedupe, sort. No DB access.
func MatchPatterns(filename string, patterns []Pattern, songArtistIDs []int) []int {
	nameWithoutExt := strings.ToLower(regexp.MustCompile(`\.[^/.]+$`).ReplaceAllString(filename, ""))

	// copy then sort longest-first so longer terms claim ranges before shorter substrings.
	sorted := make([]Pattern, len(patterns))
	copy(sorted, patterns)
	sort.Slice(sorted, func(i, j int) bool {
		return len(sorted[i].Term) > len(sorted[j].Term)
	})

	isArtistContextValid := func(aliasArtistIDs []int) bool {
		if len(aliasArtistIDs) == 0 {
			return true
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

	consumedRanges := make([]struct{ start, end int }, 0)
	isRangeConsumed := func(start, end int) bool {
		for _, r := range consumedRanges {
			if (start >= r.start && start < r.end) || (end > r.start && end <= r.end) || (start <= r.start && end >= r.end) {
				return true
			}
		}
		return false
	}

	matchedIDs := make(map[int]bool)

	// pass 1: word-boundary matches
	for _, p := range sorted {
		if p.IsAlias && !isArtistContextValid(p.AliasArtistIDs) {
			continue
		}
		if p.Term == "" {
			continue
		}
		re := regexp.MustCompile(`\b` + regexp.QuoteMeta(p.Term) + `\b`)
		for _, m := range re.FindAllStringIndex(nameWithoutExt, -1) {
			if !isRangeConsumed(m[0], m[1]) {
				matchedIDs[p.ProducerID] = true
				consumedRanges = append(consumedRanges, struct{ start, end int }{m[0], m[1]})
			}
		}
	}

	// pass 2: substring fallback
	for _, p := range sorted {
		if p.IsAlias && !isArtistContextValid(p.AliasArtistIDs) {
			continue
		}
		if p.Term == "" {
			continue
		}
		idx := strings.Index(nameWithoutExt, p.Term)
		if idx == -1 {
			continue
		}
		end := idx + len(p.Term)
		if !isRangeConsumed(idx, end) {
			matchedIDs[p.ProducerID] = true
			consumedRanges = append(consumedRanges, struct{ start, end int }{idx, end})
		}
	}

	result := make([]int, 0, len(matchedIDs))
	for id := range matchedIDs {
		result = append(result, id)
	}
	sort.Ints(result)
	return result
}

// MatchProducersFromFilename composes LoadProducerPatterns + MatchPatterns.
func (a *App) MatchProducersFromFilename(filename string, songArtistIDs []int) ([]int, error) {
	patterns, err := a.LoadProducerPatterns()
	if err != nil {
		return nil, err
	}
	return MatchPatterns(filename, patterns, songArtistIDs), nil
}
