import { renameSync } from 'node:fs';
import { extname } from 'node:path';
import {
	ALL_FORMATS,
	Conversion,
	FilePathSource,
	FilePathTarget,
	FlacOutputFormat,
	Input,
	Mp3OutputFormat,
	Mp4OutputFormat,
	OggOutputFormat,
	Output,
	type MetadataTags,
	type OutputFormat
} from 'mediabunny';

// Single metadata engine — replaces metadata*.go adapters + ffmpeg + dhowden/tag
// + bogem/id3v2 (constitution I: collapse the per-format adapter interface).
// File-level only: DB → tags (buildSongTags, inheritance/singles) lives in US2/T032.

export { type MetadataTags } from 'mediabunny';

// Mirror of backend ExtractedMetadata DTO (svelte/src/lib/wails/types.ts).
export interface ExtractedMetadata {
	title: string | null;
	artist: string | null;
	albumArtist: string | null;
	album: string | null;
	year: number | null;
	genre: string | null;
	trackNumber: number | null;
	producer: string | null;
	duration: number | null;
	artwork: { data: string; mimeType: string } | null;
}

function outputFormatForExt(ext: string): OutputFormat {
	switch (ext.toLowerCase()) {
		case '.mp3':
			return new Mp3OutputFormat();
		case '.m4a':
		case '.mp4':
		case '.m4b':
		case '.m4p':
			return new Mp4OutputFormat();
		case '.flac':
			return new FlacOutputFormat();
		case '.ogg':
		case '.oga':
			return new OggOutputFormat();
		default:
			throw new Error(`writing support for ${ext} not yet implemented`);
	}
}

// readMetadata replaces ExtractMetadata's tag read (parity with dhowden/tag).
export async function readMetadata(fullPath: string): Promise<ExtractedMetadata> {
	const input = new Input({ source: new FilePathSource(fullPath), formats: ALL_FORMATS });
	const tags = await input.getMetadataTags();

	const image = tags.images?.[0];
	return {
		title: tags.title ?? null,
		artist: tags.artist ?? null,
		albumArtist: tags.albumArtist ?? null,
		album: tags.album ?? null,
		year: tags.date ? tags.date.getFullYear() : null,
		genre: tags.genre ?? null,
		trackNumber: tags.trackNumber ?? null,
		producer: null,
		duration: null,
		artwork: image
			? { data: Buffer.from(image.data).toString('base64'), mimeType: image.mimeType }
			: null
	};
}

// writeMetadata remuxes (packet-copy, no re-encode) into a temp file with the new
// tags, then atomically replaces the original. ponytail: POSIX rename-over-open is
// fine; Windows packaging (Phase 6) may need a close-before-rename pass.
export async function writeMetadata(fullPath: string, tags: MetadataTags): Promise<void> {
	const ext = extname(fullPath);
	const format = outputFormatForExt(ext);
	const tmpPath = `${fullPath}.tmp-${Date.now()}`;

	const input = new Input({ source: new FilePathSource(fullPath), formats: ALL_FORMATS });
	const output = new Output({ format, target: new FilePathTarget(tmpPath) });

	const conversion = await Conversion.init({ input, output, tags });
	await conversion.execute();

	renameSync(tmpPath, fullPath);
}
