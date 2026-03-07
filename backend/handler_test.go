package backend

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestCreateUploadsMiddlewarePassesThroughNonUploadRoutes(t *testing.T) {
	t.Chdir(t.TempDir())

	nextCalled := false
	handler := CreateUploadsMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/wails/reload", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if !nextCalled {
		t.Fatal("expected middleware to pass through non-upload route")
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rec.Code)
	}
}

func TestCreateUploadsMiddlewareServesEscapedArtworkPaths(t *testing.T) {
	tempDir := t.TempDir()
	t.Chdir(tempDir)

	if err := os.WriteFile("wails.json", []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to create wails.json: %v", err)
	}

	artworkDir := filepath.Join("svelte", "uploads", "artwork")
	if err := os.MkdirAll(artworkDir, 0755); err != nil {
		t.Fatalf("failed to create artwork dir: %v", err)
	}

	expectedBody := []byte("cover art")
	artworkPath := filepath.Join(artworkDir, "Pink Tape (Sessions).jpg")
	if err := os.WriteFile(artworkPath, expectedBody, 0644); err != nil {
		t.Fatalf("failed to write artwork file: %v", err)
	}

	handler := CreateUploadsMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))

	req := httptest.NewRequest(http.MethodGet, "/uploads/artwork/Pink%20Tape%20(Sessions).jpg", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.StatusCode)
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}
	if string(body) != string(expectedBody) {
		t.Fatalf("expected body %q, got %q", expectedBody, body)
	}
}
