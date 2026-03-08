package backend

import "testing"

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
