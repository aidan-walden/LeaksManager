import { wailsTransport } from '$lib/wails';

export const ssr = false;
export const prerender = false;
export const trailingSlash = 'always';

export const load = async () => {
	const data = await wailsTransport.getInitialData();

	return {
		songs: data.songs,
		songsCount: data.songsCount,
		albums: data.albums,
		artists: data.artists,
		producers: data.producers,
		settings: data.settings,
		hasUnsyncedChanges: data.hasUnsyncedChanges,
		isServerMac: data.isMac,
		limits: data.limits
	};
};
