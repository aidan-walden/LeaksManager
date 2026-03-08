import type {
	AlbumWithSongs,
	ArtistWithRelations,
	InitialData,
	ProducerWithAliases,
	SongReadable
} from '$lib/wails';

export type TabViewData = {
	songs: SongReadable[];
	songsCount: number;
	albums: AlbumWithSongs[];
	artists: ArtistWithRelations[];
	producers: ProducerWithAliases[];
	settings: InitialData['settings'];
	isServerMac: boolean;
	limits: InitialData['limits'];
};
