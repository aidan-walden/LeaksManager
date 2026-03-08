package backend

import (
	"runtime"
	"testing"
)

func TestSyncSongsToAppleMusicReturnsEmptyResultWhenImportDisabled(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("Apple Music sync is only available on macOS")
	}

	app := newTestApp(t)

	result, err := app.SyncSongsToAppleMusic()
	if err != nil {
		t.Fatalf("SyncSongsToAppleMusic returned error: %v", err)
	}

	if result.TotalSongs != 0 {
		t.Fatalf("expected no songs to sync when import is disabled, got %d", result.TotalSongs)
	}
	if result.SuccessCount != 0 || result.FailureCount != 0 {
		t.Fatalf("expected zero sync counts, got %+v", result)
	}
	if len(result.Results) != 0 {
		t.Fatalf("expected no sync item results, got %d", len(result.Results))
	}
}
