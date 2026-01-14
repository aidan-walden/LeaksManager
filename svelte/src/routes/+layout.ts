import { GetInitialData } from '$lib/wails';

export const ssr = false;
export const prerender = false;
export const trailingSlash = 'always';

export const load = async () => {
	const data = await GetInitialData();
	return {
		// wrap in Promise.resolve for component compatibility
		songs: Promise.resolve(data.songs),
		songsCount: data.songsCount,
		albums: Promise.resolve(data.albums),
		artists: Promise.resolve(data.artists),
		producers: Promise.resolve(data.producers),
		settings: data.settings,
		isServerMac: data.isMac,
		limits: data.limits
	};
};
