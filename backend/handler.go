package backend

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// CreateUploadsHandler creates an HTTP handler that serves files from the uploads directory.
// This is needed because Wails embeds static assets at build time, but uploaded files
// are created at runtime and need to be served from the filesystem.
func CreateUploadsHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// only handle /uploads/ paths
		if !strings.HasPrefix(r.URL.Path, "/uploads/") {
			http.NotFound(w, r)
			return
		}

		// determine the static path (same logic as in app.go Startup)
		var staticPath string
		if _, err := os.Stat("svelte/local.db"); err == nil {
			// development mode
			staticPath = "svelte"
		} else {
			// production mode
			homeDir, _ := os.UserHomeDir()
			if runtime.GOOS == "darwin" {
				staticPath = filepath.Join(homeDir, "Library", "Application Support", "leaks-manager")
			} else if runtime.GOOS == "windows" {
				staticPath = filepath.Join(homeDir, "AppData", "Roaming", "leaks-manager")
			} else {
				staticPath = filepath.Join(homeDir, ".local", "share", "leaks-manager")
			}
		}

		// construct the full file path
		// r.URL.Path is like "/uploads/artwork/filename.jpg"
		filePath := filepath.Join(staticPath, r.URL.Path)

		// serve the file
		http.ServeFile(w, r, filePath)
	})
}
