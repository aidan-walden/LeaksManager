export type ArtistMappingValue = number | 'CREATE_NEW';

export function createArtistSelectionState(unmappedArtists: string[]) {
	return Object.fromEntries(unmappedArtists.map((artist) => [artist, 'CREATE_NEW']));
}

export function coerceArtistMapping(selection: Record<string, string>): Record<string, ArtistMappingValue> {
	return Object.fromEntries(
		Object.entries(selection).map(([artistName, selectedValue]) => {
			if (selectedValue === 'CREATE_NEW') {
				return [artistName, 'CREATE_NEW'];
			}

			const artistId = Number(selectedValue);
			if (!Number.isInteger(artistId) || artistId <= 0) {
				throw new Error(`invalid artist mapping for "${artistName}"`);
			}

			return [artistName, artistId];
		})
	);
}
