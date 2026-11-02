import type {
	AlbumSummary,
	Artist,
	InitialData,
	ProducerWithAliases,
	SongReadable
} from '$lib/ipc';

export type TabViewData = {
	songs: SongReadable[];
	songsCount: number;
	albums: AlbumSummary[];
	artists: Artist[];
	producers: ProducerWithAliases[];
	settings: InitialData['settings'];
	isMac: boolean;
	songsPerPage: number;
};
