package backend

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const uploadsRoot = "uploads"

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

func normalizeUploadsRootRelPath(relPath string) (string, error) {
	cleaned, err := normalizeUploadRelPath(relPath)
	if err != nil {
		return "", err
	}

	uploadsPrefix := uploadsRoot + string(os.PathSeparator)
	if cleaned != uploadsRoot && !strings.HasPrefix(cleaned, uploadsPrefix) {
		return "", fmt.Errorf("path outside uploads root not allowed: %s", relPath)
	}

	return cleaned, nil
}

func normalizeUploadFilename(filename string) (string, error) {
	trimmed := strings.TrimSpace(filename)
	if trimmed == "" {
		return "", fmt.Errorf("empty upload filename")
	}
	if strings.ContainsRune(trimmed, 0) {
		return "", fmt.Errorf("invalid upload filename: %q", filename)
	}
	if strings.ContainsAny(trimmed, `/\`) {
		return "", fmt.Errorf("upload filename must not contain path separators: %s", filename)
	}

	cleaned := filepath.Clean(trimmed)
	if cleaned == "." || cleaned == ".." {
		return "", fmt.Errorf("invalid upload filename: %s", filename)
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

func (a *App) uploadsFilePath(relPath string) (string, error) {
	cleaned, err := normalizeUploadsRootRelPath(relPath)
	if err != nil {
		return "", err
	}

	return a.staticFilePath(cleaned)
}

func (a *App) newUploadPath(category string, filename string) (relPath string, fullPath string, err error) {
	safeFilename, err := normalizeUploadFilename(filename)
	if err != nil {
		return "", "", err
	}

	relPath, err = normalizeUploadsRootRelPath(
		filepath.ToSlash(filepath.Join(uploadsRoot, category, fmt.Sprintf("%d-%s", time.Now().UnixMilli(), safeFilename))),
	)
	if err != nil {
		return "", "", err
	}

	fullPath, err = a.uploadsFilePath(relPath)
	if err != nil {
		return "", "", err
	}

	return relPath, fullPath, nil
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
