package backend

import (
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

func CreateUploadsMiddleware() assetserver.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasPrefix(r.URL.Path, "/uploads/") {
				next.ServeHTTP(w, r)
				return
			}

			serveUploadFile(w, r)
		})
	}
}

func serveUploadFile(w http.ResponseWriter, r *http.Request) {
	_, staticPath, err := resolveAppPaths(nil)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	uploadsRoot := filepath.Join(staticPath, "uploads")

	relURLPath := strings.TrimPrefix(r.URL.Path, "/uploads/")
	decodedURLPath, err := url.PathUnescape(relURLPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	cleanURLPath := path.Clean("/" + decodedURLPath)
	if cleanURLPath == "/" {
		http.NotFound(w, r)
		return
	}

	relPath := strings.TrimPrefix(cleanURLPath, "/")
	filePath := filepath.Join(uploadsRoot, filepath.FromSlash(relPath))

	uploadsRootAbs, err := filepath.Abs(uploadsRoot)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	filePathAbs, err := filepath.Abs(filePath)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	relToRoot, err := filepath.Rel(uploadsRootAbs, filePathAbs)
	if err != nil || relToRoot == ".." || strings.HasPrefix(relToRoot, ".."+string(filepath.Separator)) {
		http.NotFound(w, r)
		return
	}

	if _, err := os.Stat(filePathAbs); err != nil {
		if os.IsNotExist(err) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	http.ServeFile(w, r, filePathAbs)
}
