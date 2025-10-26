import { getAlbums, getArtists, getSongsReadable } from '$lib/server/db/helpers';

export const load = async () => {
	const SONGS_PER_PAGE = 25;
	const ALBUMS_PER_PAGE = 25;

	const [songs, albums, artists] = await Promise.all([
		getSongsReadable({ limit: SONGS_PER_PAGE, offset: 0 }),
		getAlbums({ limit: ALBUMS_PER_PAGE, offset: 0 }),
		getArtists()
	]);

	return {
		songs,
		albums,
		artists,
		limits: {
			songsPerPage: SONGS_PER_PAGE,
			albumsPerPage: ALBUMS_PER_PAGE
		}
	};
};
