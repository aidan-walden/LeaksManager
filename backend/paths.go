package backend

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
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

	fullPath, err := filepath.Abs(filepath.Join(a.staticPath, cleaned))
	if err != nil {
		return "", fmt.Errorf("failed to resolve absolute path for %s: %w", relPath, err)
	}

	return fullPath, nil
}

func isDevMode(ctx context.Context) bool {
	if ctx != nil {
		if buildType, _ := ctx.Value("buildtype").(string); buildType == "dev" {
			return true
		}
	}

	// wails dev sets these env vars for the app process
	if os.Getenv("frontenddevserverurl") != "" || os.Getenv("assetdir") != "" || os.Getenv("devserver") != "" {
		return true
	}

	// local repo checkout without an existing db should still use the project paths
	if _, err := os.Stat("wails.json"); err == nil {
		if info, err := os.Stat("svelte"); err == nil && info.IsDir() {
			return true
		}
	}

	return false
}

func userDataDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to determine user home directory: %w", err)
	}

	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(homeDir, "Library", "Application Support", "leaks-manager"), nil
	case "windows":
		return filepath.Join(homeDir, "AppData", "Roaming", "leaks-manager"), nil
	default:
		return filepath.Join(homeDir, ".local", "share", "leaks-manager"), nil
	}
}

func resolveAppPaths(ctx context.Context) (dbPath string, staticPath string, err error) {
	if isDevMode(ctx) {
		return filepath.Join("svelte", "local.db"), "svelte", nil
	}

	dataDir, err := userDataDir()
	if err != nil {
		return "", "", err
	}

	return filepath.Join(dataDir, "local.db"), dataDir, nil
}
