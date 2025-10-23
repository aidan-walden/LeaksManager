import { getAlbums, getArtists, getSongs, getSongsReadable } from '$lib/server/db/helpers';

export const load = async () => {
	const [songs, albums, artists] = await Promise.all([
		getSongsReadable({ limit: 50, offset: 0 }),
		getAlbums({ limit: 50, offset: 0 }),
		getArtists()
	]);

	return { songs, albums, artists };
};
