package backend

import (
	"regexp"
	"strings"
)

// ParseArtists splits an artist string by common delimiters
func ParseArtists(artistString string) []string {
	if strings.TrimSpace(artistString) == "" {
		return []string{}
	}

	// Split by: comma, ampersand, semicolon, feat., ft., featuring
	re := regexp.MustCompile(`[,&;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+`)
	parts := re.Split(artistString, -1)

	// Deduplicate while preserving order
	seen := make(map[string]bool)
	var result []string
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			result = append(result, trimmed)
		}
	}
	return result
}
