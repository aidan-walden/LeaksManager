package backend

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// normalizeUploadRelPath keeps upload paths relative to staticPath.
// It accepts legacy values with a leading slash for backward compatibility.
func normalizeUploadRelPath(relPath string) (string, error) {
	cleaned := filepath.Clean(filepath.FromSlash(strings.TrimSpace(relPath)))
	cleaned = strings.TrimPrefix(cleaned, string(os.PathSeparator))

	if cleaned == "" || cleaned == "." {
		return "", fmt.Errorf("empty upload path")
	}
	if filepath.IsAbs(cleaned) {
		return "", fmt.Errorf("absolute upload path not allowed: %s", relPath)
	}
	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("path traversal not allowed: %s", relPath)
	}

	return cleaned, nil
}

func (a *App) staticFilePath(relPath string) (string, error) {
	cleaned, err := normalizeUploadRelPath(relPath)
	if err != nil {
		return "", err
	}
	return filepath.Join(a.staticPath, cleaned), nil
}
