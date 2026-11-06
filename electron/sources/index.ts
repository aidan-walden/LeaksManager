import type { SongSourceInfo } from '../domain/models';
import { juiceWrldSource } from './juice-wrld';
import type { SongSource } from './song-source';

const songSources: SongSource[] = [juiceWrldSource];

export const sourceImageOrigins = songSources.flatMap((source) => source.imageOrigins);

export function listSongSources(): SongSourceInfo[] {
	return songSources.map(({ id, name }) => ({ id, name }));
}

export function getSongSource(sourceId: string): SongSource {
	const source = songSources.find((s) => s.id === sourceId);
	if (!source) throw new Error(`unknown song source: ${sourceId}`);
	return source;
}
