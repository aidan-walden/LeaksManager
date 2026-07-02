package backend

import "testing"

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
