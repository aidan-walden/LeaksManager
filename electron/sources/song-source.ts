import type {
	SongSourceInfo,
	SourceBrowseQuery,
	SourceFilter,
	SourceSong,
	SourceSongPage
} from '../domain/models';

export interface SourceSongFile {
	song: SourceSong;
	filename: string;
	size: number | null;
	body: ReadableStream<Uint8Array>;
}

// One catalog of downloadable songs. Add a source by implementing this and listing it
// in ./index.ts. Song ids and filter values arrive from the renderer, so a source must
// treat them as untrusted.
export interface SongSource extends SongSourceInfo {
	// Origins that serve SourceSong.artworkUrl. The packaged app's CSP allows these.
	imageOrigins: string[];
	getFilters(): Promise<SourceFilter[]>;
	browse(query: SourceBrowseQuery): Promise<SourceSongPage>;
	// Rejects when the song has no file. The caller must consume or cancel `body`.
	// Aborting `signal` must stop the request and also the transfer of `body`.
	downloadSong(songId: string, signal?: AbortSignal): Promise<SourceSongFile>;
}
