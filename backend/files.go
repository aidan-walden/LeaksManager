package backend

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// --- File Operations ---

func (a *App) SaveUploadedFile(filename string, base64Data string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %v", err)
	}

	relPath, fullPath, err := a.newUploadPath("songs", filename)
	if err != nil {
		return "", err
	}

	err = os.WriteFile(fullPath, data, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to write file: %v", err)
	}

	return relPath, nil
}

func (a *App) SaveArtwork(filename string, base64Data string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %v", err)
	}

	relPath, fullPath, err := a.newUploadPath("artwork", filename)
	if err != nil {
		return "", err
	}

	err = os.WriteFile(fullPath, data, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to write file: %v", err)
	}

	return relPath, nil
}

func (a *App) DeleteFile(relPath string) error {
	fullPath, err := a.uploadsFilePath(relPath)
	if err != nil {
		return err
	}
	return os.Remove(fullPath)
}

func (a *App) CleanupFiles(relPaths []string) int {
	deleted := 0
	for _, relPath := range relPaths {
		if a.DeleteFile(relPath) == nil {
			deleted++
		}
	}
	return deleted
}

func (a *App) ShowInFileExplorer(relPath string) error {
	fullPath, err := a.uploadsFilePath(relPath)
	if err != nil {
		return err
	}

	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-R", fullPath).Start()
	case "windows":
		return exec.Command("explorer", "/select,", fullPath).Start()
	default:
		return exec.Command("xdg-open", filepath.Dir(fullPath)).Start()
	}
}

func (a *App) UploadAlbumArt(albumID int, filename string, base64Data string) error {
	relPath, err := a.SaveArtwork(filename, base64Data)
	if err != nil {
		return err
	}

	_, err = a.db.Exec(`UPDATE albums SET artwork_path = ? WHERE id = ?`, relPath, albumID)
	return err
}
