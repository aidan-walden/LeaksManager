import type {
	AlbumWithSongs,
	Artist,
	InitialData,
	ProducerWithAliases,
	SongReadable
} from '$lib/ipc';

export type TabViewData = {
	songs: SongReadable[];
	songsCount: number;
	albums: AlbumWithSongs[];
	artists: Artist[];
	producers: ProducerWithAliases[];
	settings: InitialData['settings'];
	isServerMac: boolean;
	limits: InitialData['limits'];
};
