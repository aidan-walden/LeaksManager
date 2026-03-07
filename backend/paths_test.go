package backend

import (
	"path/filepath"
	"testing"
)

func TestStaticFilePathReturnsAbsolutePath(t *testing.T) {
	tempDir := t.TempDir()
	t.Chdir(tempDir)

	app := &App{staticPath: "svelte"}

	fullPath, err := app.staticFilePath("uploads/songs/example.m4a")
	if err != nil {
		t.Fatalf("staticFilePath returned error: %v", err)
	}

	if !filepath.IsAbs(fullPath) {
		t.Fatalf("expected absolute path, got %q", fullPath)
	}

	expectedSuffix := filepath.Join("svelte", "uploads", "songs", "example.m4a")
	if fullPath != filepath.Join(tempDir, expectedSuffix) {
		t.Fatalf("expected path %q, got %q", filepath.Join(tempDir, expectedSuffix), fullPath)
	}
}
