package backend

import (
	"strings"
	"testing"
)

func TestResolveOrCreateAlbumExactMatch(t *testing.T) {
	app := newTestApp(t)

	artist, err := app.CreateArtist(CreateArtistInput{Name: "Drake"})
	if err != nil {
		t.Fatalf("CreateArtist: %v", err)
	}

	orig, err := app.CreateAlbum(CreateAlbumInput{
		Name:      "Scorpion",
		ArtistIDs: []int{artist.ID},
	})
	if err != nil {
		t.Fatalf("CreateAlbum: %v", err)
	}

	got, created, err := app.ResolveOrCreateAlbum("Scorpion", []int{artist.ID}, AlbumResolutionOpts{})
	if err != nil {
		t.Fatalf("ResolveOrCreateAlbum: %v", err)
	}
	if created {
		t.Fatalf("expected match, got created=true")
	}
	if got == nil || got.ID != orig.ID {
		t.Fatalf("expected to match id %d, got %#v", orig.ID, got)
	}
}

func TestResolveOrCreateAlbumCaseInsensitiveMatch(t *testing.T) {
	app := newTestApp(t)

	artist, err := app.CreateArtist(CreateArtistInput{Name: "Drake"})
	if err != nil {
		t.Fatalf("CreateArtist: %v", err)
	}
	orig, err := app.CreateAlbum(CreateAlbumInput{
		Name:      "Scorpion",
		ArtistIDs: []int{artist.ID},
	})
	if err != nil {
		t.Fatalf("CreateAlbum: %v", err)
	}

	got, created, err := app.ResolveOrCreateAlbum("SCORPION", []int{artist.ID}, AlbumResolutionOpts{})
	if err != nil {
		t.Fatalf("ResolveOrCreateAlbum: %v", err)
	}
	if created {
		t.Fatalf("expected case-insensitive match, got created=true")
	}
	if got == nil || got.ID != orig.ID {
		t.Fatalf("expected match id %d, got %#v", orig.ID, got)
	}
}

func TestResolveOrCreateAlbumCreatesWhenMissing(t *testing.T) {
	app := newTestApp(t)

	artist, err := app.CreateArtist(CreateArtistInput{Name: "Drake"})
	if err != nil {
		t.Fatalf("CreateArtist: %v", err)
	}

	got, created, err := app.ResolveOrCreateAlbum("Brand New", []int{artist.ID}, AlbumResolutionOpts{})
	if err != nil {
		t.Fatalf("ResolveOrCreateAlbum: %v", err)
	}
	if !created {
		t.Fatalf("expected created=true")
	}
	if got == nil || got.Name != "Brand New" {
		t.Fatalf("expected created album 'Brand New', got %#v", got)
	}

	artists, err := app.getArtistsForAlbum(got.ID)
	if err != nil {
		t.Fatalf("getArtistsForAlbum: %v", err)
	}
	if len(artists) != 1 || artists[0].ID != artist.ID {
		t.Fatalf("expected one linked artist id=%d, got %#v", artist.ID, artists)
	}
}

func TestResolveOrCreateAlbumIsSingleHonored(t *testing.T) {
	app := newTestApp(t)

	artist, err := app.CreateArtist(CreateArtistInput{Name: "Drake"})
	if err != nil {
		t.Fatalf("CreateArtist: %v", err)
	}

	// create new with IsSingle
	got, created, err := app.ResolveOrCreateAlbum("Solo Track", []int{artist.ID}, AlbumResolutionOpts{IsSingle: true})
	if err != nil {
		t.Fatalf("ResolveOrCreateAlbum: %v", err)
	}
	if !created || !got.IsSingle {
		t.Fatalf("expected created single, got created=%v isSingle=%v", created, got.IsSingle)
	}

	// existing non-single album upgraded to single when IsSingle=true
	nonSingle, err := app.CreateAlbum(CreateAlbumInput{
		Name:      "Mixtape",
		ArtistIDs: []int{artist.ID},
		IsSingle:  false,
	})
	if err != nil {
		t.Fatalf("CreateAlbum: %v", err)
	}
	upgraded, created2, err := app.ResolveOrCreateAlbum("Mixtape", []int{artist.ID}, AlbumResolutionOpts{IsSingle: true})
	if err != nil {
		t.Fatalf("ResolveOrCreateAlbum upgrade: %v", err)
	}
	if created2 {
		t.Fatalf("expected match, got created=true")
	}
	if upgraded.ID != nonSingle.ID {
		t.Fatalf("expected to upgrade existing %d, got %d", nonSingle.ID, upgraded.ID)
	}
	if !upgraded.IsSingle {
		t.Fatalf("expected is_single=true after upgrade")
	}
}

func TestResolveOrCreateAlbumArtistSetMismatchCreatesNew(t *testing.T) {
	app := newTestApp(t)

	a1, err := app.CreateArtist(CreateArtistInput{Name: "Drake"})
	if err != nil {
		t.Fatalf("CreateArtist: %v", err)
	}
	a2, err := app.CreateArtist(CreateArtistInput{Name: "Future"})
	if err != nil {
		t.Fatalf("CreateArtist: %v", err)
	}

	orig, err := app.CreateAlbum(CreateAlbumInput{
		Name:      "Collab",
		ArtistIDs: []int{a1.ID},
	})
	if err != nil {
		t.Fatalf("CreateAlbum: %v", err)
	}

	// same name but different artist set -> new album
	got, created, err := app.ResolveOrCreateAlbum("Collab", []int{a1.ID, a2.ID}, AlbumResolutionOpts{})
	if err != nil {
		t.Fatalf("ResolveOrCreateAlbum: %v", err)
	}
	if !created {
		t.Fatalf("expected created=true on artist mismatch")
	}
	if got.ID == orig.ID {
		t.Fatalf("expected new album, got same id %d", orig.ID)
	}
	if !strings.EqualFold(got.Name, "Collab") {
		t.Fatalf("expected name 'Collab', got %q", got.Name)
	}
}
