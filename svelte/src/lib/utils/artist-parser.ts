/**
 * Parse artist names from a metadata string that may contain multiple artists
 * separated by common delimiters.
 *
 * Supported delimiters:
 * - Comma: "Artist1, Artist2, Artist3"
 * - Ampersand: "Artist1 & Artist2"
 * - Featuring variants: "Artist1 feat. Artist2", "Artist1 ft. Artist2", "Artist1 featuring Artist2"
 *
 * @param artistString - Raw artist string from metadata
 * @returns Array of individual artist names, trimmed and deduplicated
 *
 * @example
 * parseArtists("Kanye West feat. Jay-Z & Rihanna")
 * // Returns: ["Kanye West", "Jay-Z", "Rihanna"]
 *
 * parseArtists("The Beatles, John Lennon")
 * // Returns: ["The Beatles", "John Lennon"]
 */
export function parseArtists(artistString: string | null | undefined): string[] {
	if (!artistString || artistString.trim().length === 0) {
		return [];
	}

	// Split by common delimiters:
	// - Comma (,)
	// - Ampersand (&)
	// - feat., ft., featuring (case-insensitive)
	// - Semicolon (;) for completeness
	const artists = artistString
		.split(/[,&;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+/i)
		.map((artist) => artist.trim())
		.filter((artist) => artist.length > 0);

	// Deduplicate while preserving order
	const seen = new Set<string>();
	const unique: string[] = [];

	for (const artist of artists) {
		// Case-sensitive deduplication (preserve original casing)
		if (!seen.has(artist)) {
			seen.add(artist);
			unique.push(artist);
		}
	}

	return unique;
}
