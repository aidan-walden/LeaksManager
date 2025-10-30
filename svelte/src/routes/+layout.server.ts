import { getAlbumsWithSongs, getArtists, getProducers, getSongsReadable, getSettings } from '$lib/server/db/helpers';

export const load = async () => {
	const SONGS_PER_PAGE = 25;
	const ALBUMS_PER_PAGE = 25;

	return {
		songs: getSongsReadable({ limit: SONGS_PER_PAGE, offset: 0 }),
		albums: getAlbumsWithSongs({ limit: ALBUMS_PER_PAGE, offset: 0 }),
		artists: getArtists(),
		producers: getProducers(),
		settings: await getSettings(),
		isServerMac: process.platform === 'darwin',
		limits: {
			songsPerPage: SONGS_PER_PAGE,
			albumsPerPage: ALBUMS_PER_PAGE
		}
	};
};
