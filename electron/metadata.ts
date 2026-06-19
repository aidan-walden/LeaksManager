import { renameSync } from 'node:fs';
import { extname } from 'node:path';
import {
	ALL_FORMATS,
	Conversion,
	EncodedAudioPacketSource,
	EncodedPacketSink,
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
	const ext = extname(fullPath).toLowerCase();
	const format = outputFormatForExt(ext);
	const tmpPath = `${fullPath}.tmp-${Date.now()}`;

	const input = new Input({ source: new FilePathSource(fullPath), formats: ALL_FORMATS });
	const output = new Output({ format, target: new FilePathTarget(tmpPath) });

	// M4A/MP4 (AAC) can't go through Conversion: mediabunny has no AAC decoder under
	// Node, so Conversion discards the audio as `undecodable_source_codec`. The fix is
	// a true passthrough — copy the encoded packets straight across (no decode/encode),
	// which is all a tag-only rewrite needs. Other formats packet-copy fine via Conversion.
	if (ext === '.m4a' || ext === '.mp4' || ext === '.m4b' || ext === '.m4p') {
		await passthroughRemux(input, output, tags);
	} else {
		const conversion = await Conversion.init({ input, output, tags });
		await conversion.execute();
	}

	renameSync(tmpPath, fullPath);
}

// passthroughRemux copies an input's audio track into a fresh output as raw encoded
// packets (no transcode) and applies new metadata tags. AAC streams carry an encoder
// priming delay (the first packets have negative timestamps); we rebase timestamps to
// start at zero so the ISOBMFF muxer accepts them.
async function passthroughRemux(
	input: Input,
	output: Output,
	tags: MetadataTags
): Promise<void> {
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) throw new Error('no audio track to copy');
		const codec = await track.getCodec();
		if (!codec) throw new Error('unknown audio codec');
		const decoderConfig = await track.getDecoderConfig();

		output.setMetadataTags(tags);
		const source = new EncodedAudioPacketSource(codec);
		output.addAudioTrack(source);
		await output.start();

		const sink = new EncodedPacketSink(track);
		let first = true;
		let offset = 0;
		for await (const packet of sink.packets()) {
			if (first) offset = packet.timestamp;
			const ts = Math.max(0, packet.timestamp - offset);
			await source.add(packet.clone({ timestamp: ts }), first ? { decoderConfig: decoderConfig ?? undefined } : undefined);
			first = false;
		}
		await output.finalize();
	} finally {
		input.dispose();
	}
}
