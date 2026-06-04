package backend

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// makeSilentAudio uses ffmpeg to synthesize a tiny audio file in the requested
// codec/container. Returns the path or skips the test if ffmpeg is missing.
func makeSilentAudio(t *testing.T, dir, name, codec, ext string) string {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not available")
	}
	out := filepath.Join(dir, name+ext)
	args := []string{
		"-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=0.4:sample_rate=44100",
		"-ac", "2",
		"-c:a", codec,
	}
	if codec == "vorbis" {
		args = append(args, "-strict", "experimental")
	}
	if ext == ".m4a" {
		args = append(args, "-movflags", "+faststart")
	}
	args = append(args, "-y", out)
	cmd := exec.Command("ffmpeg", args...)
	if outBytes, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("ffmpeg synth failed for %s: %v\n%s", out, err, string(outBytes))
	}
	return out
}

// makeArtwork writes a tiny PNG and returns its path.
func makeArtwork(t *testing.T, dir string) string {
	t.Helper()
	p := filepath.Join(dir, "art.png")
	f, err := os.Create(p)
	if err != nil {
		t.Fatalf("create png: %v", err)
	}
	defer f.Close()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for x := 0; x < 8; x++ {
		for y := 0; y < 8; y++ {
			img.Set(x, y, color.RGBA{R: 255, G: 0, B: 128, A: 255})
		}
	}
	if err := png.Encode(f, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return p
}

func sampleTags(artPath string) SongTags {
	return SongTags{
		Title:           "Test Title",
		Artist:          "Test Artist",
		AlbumArtist:     "Various Artists",
		Album:           "Test Album",
		Genre:           "Hip-Hop",
		Year:            2024,
		TrackNumberStr:  "3/10",
		TrackNumber:     3,
		TrackTotal:      10,
		Producers:       "Producer A, Producer B",
		ArtworkPath:     artPath,
		ArtworkMimeType: "image/png",
	}
}

func assertCoreTagsMatch(t *testing.T, got, want SongTags) {
	t.Helper()
	if got.Title != want.Title {
		t.Errorf("title: got %q want %q", got.Title, want.Title)
	}
	if got.Artist != want.Artist {
		t.Errorf("artist: got %q want %q", got.Artist, want.Artist)
	}
	if got.Album != want.Album {
		t.Errorf("album: got %q want %q", got.Album, want.Album)
	}
	if got.AlbumArtist != want.AlbumArtist {
		t.Errorf("album artist: got %q want %q", got.AlbumArtist, want.AlbumArtist)
	}
	if got.Genre != want.Genre {
		t.Errorf("genre: got %q want %q", got.Genre, want.Genre)
	}
	if got.Year != want.Year {
		t.Errorf("year: got %d want %d", got.Year, want.Year)
	}
	if got.TrackNumber != want.TrackNumber {
		t.Errorf("track number: got %d want %d", got.TrackNumber, want.TrackNumber)
	}
	if got.Producers != want.Producers {
		t.Errorf("producers: got %q want %q", got.Producers, want.Producers)
	}
	if got.ArtworkPath == "" {
		t.Errorf("expected embedded artwork to survive, got empty ArtworkPath")
	}
}

func TestID3AdapterRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := makeSilentAudio(t, dir, "sample", "libmp3lame", ".mp3")
	art := makeArtwork(t, dir)
	tags := sampleTags(art)

	a := id3Adapter{}
	if err := a.Write(path, tags); err != nil {
		t.Fatalf("id3 Write: %v", err)
	}
	got, err := a.Read(path)
	if err != nil {
		t.Fatalf("id3 Read: %v", err)
	}
	assertCoreTagsMatch(t, got, tags)
}

func TestFlacAdapterRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := makeSilentAudio(t, dir, "sample", "flac", ".flac")
	art := makeArtwork(t, dir)
	tags := sampleTags(art)

	a := flacAdapter{}
	if err := a.Write(path, tags); err != nil {
		t.Fatalf("flac Write: %v", err)
	}
	got, err := a.Read(path)
	if err != nil {
		t.Fatalf("flac Read: %v", err)
	}
	assertCoreTagsMatch(t, got, tags)
}

func TestOggAdapterRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := makeSilentAudio(t, dir, "sample", "vorbis", ".ogg")
	art := makeArtwork(t, dir)
	tags := sampleTags(art)

	a := oggAdapter{}
	if err := a.Write(path, tags); err != nil {
		t.Fatalf("ogg Write: %v", err)
	}
	got, err := a.Read(path)
	if err != nil {
		t.Fatalf("ogg Read: %v", err)
	}
	assertCoreTagsMatch(t, got, tags)
}

func TestMP4AdapterRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := makeSilentAudio(t, dir, "sample", "aac", ".m4a")
	art := makeArtwork(t, dir)
	tags := sampleTags(art)

	a := mp4Adapter{}
	if err := a.Write(path, tags); err != nil {
		t.Fatalf("mp4 Write: %v", err)
	}
	got, err := a.Read(path)
	if err != nil {
		t.Fatalf("mp4 Read: %v", err)
	}
	assertCoreTagsMatch(t, got, tags)
}

func TestPickAdapter(t *testing.T) {
	cases := map[string]bool{
		".mp3":     true,
		".MP3":     true,
		".flac":    true,
		".m4a":     true,
		".mp4":     true,
		".ogg":     true,
		".oga":     true,
		".wav":     false,
		".unknown": false,
	}
	for ext, want := range cases {
		got := pickAdapter(ext) != nil
		if got != want {
			t.Errorf("pickAdapter(%q): got %v want %v", ext, got, want)
		}
	}
}
