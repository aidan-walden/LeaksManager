package backend

import (
	"reflect"
	"sort"
	"testing"
)

func TestMatchPatterns(t *testing.T) {
	// shared pattern set: metro boomin with restricted "Metro" alias, wheezy with
	// long alias, and a producer whose name is a substring of unrelated words.
	patterns := []Pattern{
		{Term: "metro boomin", ProducerID: 1, IsAlias: false},
		{Term: "metro", ProducerID: 1, IsAlias: true, AliasArtistIDs: []int{100}},
		{Term: "wheezy", ProducerID: 2, IsAlias: false},
		{Term: "wheezy outta here", ProducerID: 2, IsAlias: true},
		{Term: "cash", ProducerID: 3, IsAlias: false},
	}

	tests := []struct {
		name          string
		filename      string
		songArtistIDs []int
		want          []int
	}{
		{
			name:     "exact producer name match",
			filename: "Song [Metro Boomin].mp3",
			want:     []int{1},
		},
		{
			name:          "alias match with valid artist",
			filename:      "Song [Metro].mp3",
			songArtistIDs: []int{100},
			want:          []int{1},
		},
		{
			name:          "restricted alias skipped when artist not in context",
			filename:      "Song [Metro].mp3",
			songArtistIDs: []int{999},
			want:          []int{},
		},
		{
			name:     "restricted alias skipped when no song artists",
			filename: "Song [Metro].mp3",
			want:     []int{},
		},
		{
			name:     "multi-word term does not match inside concatenated token",
			filename: "metroboomintrack.mp3", // no spaces, so multi-word "metro boomin" cannot appear
			want:     []int{},
		},
		{
			name:     "longer alias wins over substring",
			filename: "Track (Wheezy Outta Here).mp3",
			want:     []int{2},
		},
		{
			name:          "multiple producers in filename",
			filename:      "Song [Metro] (Wheezy Outta Here).mp3",
			songArtistIDs: []int{100},
			want:          []int{1, 2},
		},
		{
			name:     "snapshot: real filename matches both producers via names",
			filename: "Metro Boomin x Wheezy.mp3",
			want:     []int{1, 2},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := MatchPatterns(tc.filename, patterns, tc.songArtistIDs)
			sort.Ints(got)
			want := append([]int{}, tc.want...)
			sort.Ints(want)
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("MatchPatterns(%q, %v) = %v, want %v", tc.filename, tc.songArtistIDs, got, want)
			}
		})
	}
}

func TestMatchProducersFromFilenameHonorsAliasRestrictionsAndLongestMatches(t *testing.T) {
	app := newTestApp(t)

	restrictedArtist, err := app.CreateArtist(CreateArtistInput{Name: "Restricted Artist"})
	if err != nil {
		t.Fatalf("CreateArtist returned error: %v", err)
	}
	otherArtist, err := app.CreateArtist(CreateArtistInput{Name: "Other Artist"})
	if err != nil {
		t.Fatalf("CreateArtist returned error: %v", err)
	}

	metro, err := app.CreateProducerWithAliases(CreateProducerInput{
		Name: "Metro Boomin",
		Aliases: []AliasInput{
			{Name: "Metro", ArtistIDs: []int{restrictedArtist.ID}},
		},
	})
	if err != nil {
		t.Fatalf("CreateProducerWithAliases returned error: %v", err)
	}
	wheezy, err := app.CreateProducerWithAliases(CreateProducerInput{
		Name: "Wheezy",
		Aliases: []AliasInput{
			{Name: "Wheezy Outta Here"},
		},
	})
	if err != nil {
		t.Fatalf("CreateProducerWithAliases returned error: %v", err)
	}

	matches, err := app.MatchProducersFromFilename("Song [Metro] (Wheezy Outta Here).mp3", []int{restrictedArtist.ID})
	if err != nil {
		t.Fatalf("MatchProducersFromFilename returned error: %v", err)
	}
	if len(matches) != 2 {
		t.Fatalf("expected 2 producer matches, got %d", len(matches))
	}

	restrictedMatches, err := app.MatchProducersFromFilename("Song [Metro].mp3", []int{otherArtist.ID})
	if err != nil {
		t.Fatalf("MatchProducersFromFilename returned error: %v", err)
	}
	if len(restrictedMatches) != 0 {
		t.Fatalf("expected restricted alias to be ignored, got %v", restrictedMatches)
	}

	nameMatch, err := app.MatchProducersFromFilename("Metro Boomin x Wheezy.mp3", []int{restrictedArtist.ID})
	if err != nil {
		t.Fatalf("MatchProducersFromFilename returned error: %v", err)
	}
	if len(nameMatch) != 2 {
		t.Fatalf("expected direct producer names to match once each, got %v", nameMatch)
	}

	if metro.ID == wheezy.ID {
		t.Fatal("expected distinct producer ids")
	}
}
