import { getProducerByAlias, getAllProducersWithAliases } from '@/server/db/helpers';

/**
 * Extract potential producer names/aliases from a filename
 * Focuses on content within parentheses and splits by common separators
 * Example: "song name (brandon x outtatown x acahi) ruff.mp3" → ["brandon", "outtatown", "acahi"]
 */
function extractPotentialProducers(filename: string): string[] {
	// Remove file extension
	const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

	const potentialProducers = new Set<string>();

	// Regex to extract all content within parentheses
	const parenthesesRegex = /\(([^)]+)\)/g;
	const parenthesesMatches = nameWithoutExt.matchAll(parenthesesRegex);

	for (const match of parenthesesMatches) {
		const content = match[1]; // Get the content inside parentheses

		// Split by common separators: x, &, comma, semicolon, "and", "feat", "ft", "with"
		// Use regex to split by these patterns (case-insensitive)
		const tokens = content.split(/\s+x\s+|\s*&\s*|\s*,\s*|\s*;\s*|\s+and\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+/gi);

		// Clean up each token and add to set
		for (const token of tokens) {
			const cleaned = token.trim();
			if (cleaned.length > 0) {
				// Remove any remaining special characters and extra whitespace
				const normalized = cleaned.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
				if (normalized.length > 0) {
					potentialProducers.add(normalized.toLowerCase());
				}
			}
		}
	}

	return Array.from(potentialProducers);
}

/**
 * Match producers from a filename based on aliases
 * @param filename The filename to search for producer aliases
 * @param songArtistIds Optional array of artist IDs for the song (for artist-restricted aliases)
 * @returns Array of matched producer IDs
 */
export async function matchProducersFromFilename(
	filename: string,
	songArtistIds?: number[]
): Promise<number[]> {
	// Get all producers with their aliases
	const producersWithAliases = await getAllProducersWithAliases();

	// Extract potential producer names from filename
	const potentialProducers = extractPotentialProducers(filename);

	console.log('Potential producers extracted from filename:', potentialProducers);

	const matchedProducerIds = new Set<number>();

	// For each potential producer name, check if it matches any alias
	for (const potentialName of potentialProducers) {
		// Try exact match first
		for (const producer of producersWithAliases) {
			// Check producer name
			if (producer.name.toLowerCase() === potentialName) {
				matchedProducerIds.add(producer.id);
				continue;
			}

			// Check aliases
			for (const alias of producer.producerAliases) {
				if (alias.alias.toLowerCase() === potentialName) {
					// Check if alias is global or matches artist context
					if (alias.producerAliasArtists.length === 0) {
						// Global alias
						matchedProducerIds.add(producer.id);
					} else if (songArtistIds && songArtistIds.length > 0) {
						// Check if any song artist matches the alias artist restrictions
						const aliasArtistIds = alias.producerAliasArtists.map((paa) => paa.artistId);
						const hasMatch = songArtistIds.some((id) => aliasArtistIds.includes(id));
						if (hasMatch) {
							matchedProducerIds.add(producer.id);
						}
					}
				}
			}
		}

		// Try partial match (alias contains the potential name or vice versa)
		for (const producer of producersWithAliases) {
			// Check if potential name is contained in producer name
			if (
				producer.name.toLowerCase().includes(potentialName) ||
				potentialName.includes(producer.name.toLowerCase())
			) {
				matchedProducerIds.add(producer.id);
				continue;
			}

			// Check aliases
			for (const alias of producer.producerAliases) {
				if (
					alias.alias.toLowerCase().includes(potentialName) ||
					potentialName.includes(alias.alias.toLowerCase())
				) {
					// Check if alias is global or matches artist context
					if (alias.producerAliasArtists.length === 0) {
						// Global alias
						matchedProducerIds.add(producer.id);
					} else if (songArtistIds && songArtistIds.length > 0) {
						// Check if any song artist matches the alias artist restrictions
						const aliasArtistIds = alias.producerAliasArtists.map((paa) => paa.artistId);
						const hasMatch = songArtistIds.some((id) => aliasArtistIds.includes(id));
						if (hasMatch) {
							matchedProducerIds.add(producer.id);
						}
					}
				}
			}
		}
	}

	return Array.from(matchedProducerIds);
}

/**
 * Match a single producer by alias name
 * @param aliasName The alias to search for
 * @param songArtistIds Optional array of artist IDs for context
 * @returns Producer ID if found, null otherwise
 */
export async function matchProducerByAlias(
	aliasName: string,
	songArtistIds?: number[]
): Promise<number | null> {
	const producer = await getProducerByAlias(aliasName, songArtistIds);
	return producer ? producer.id : null;
}
