import { existsSync, renameSync, unlinkSync } from 'node:fs';
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

// Single metadata engine replacing the legacy per-format adapter stack.
// File-level only: DB → tags (buildSongTags, inheritance/singles) lives in US2/T032.

export { type MetadataTags } from 'mediabunny';

// Mirror of backend ExtractedMetadata DTO (svelte/src/lib/IPC/types.ts).
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

// disposeInput frees an Input's underlying resources (notably the FilePathSource fd,
// which otherwise leaks until GC and risks EMFILE on bulk imports). It works around a
// mediabunny quirk: Input.dispose() runs `void this._demuxerPromise?.then(d => d.dispose())`
// with no rejection handler, so disposing a file that failed to demux (unrecognizable or
// corrupt) surfaces an unhandled promise rejection. We defensively hand that internal
// `.then` a value it can always consume; if the internal shape ever changes we fall back
// to a plain dispose (fd still freed).
function disposeInput(input: Input): void {
	const holder = input as unknown as {
		_demuxerPromise?: Promise<{ dispose(): void }>;
	};
	const pending = holder._demuxerPromise;
	if (pending && typeof pending.then === 'function') {
		holder._demuxerPromise = pending.then(
			(demuxer) => demuxer,
			() => ({ dispose() {} })
		);
	}
	input.dispose();
}

// mergeTags overlays new tags onto the file's existing metadata instead of replacing
// it: scalar fields in `overrides` win, everything else (including unrelated `raw`
// entries such as previously-written producer credits) is preserved. Passing a static
// tags object to mediabunny would REPLACE all input metadata; merging keeps parity with
// the old backend, which only ever touched the fields it wrote.
function mergeTags(inputTags: MetadataTags, overrides: MetadataTags): MetadataTags {
	return { ...inputTags, ...overrides, raw: { ...inputTags.raw, ...overrides.raw } };
}

// readMetadata replaces ExtractMetadata's tag read (parity with dhowden/tag).
export async function readMetadata(fullPath: string): Promise<ExtractedMetadata> {
	const input = new Input({ source: new FilePathSource(fullPath), formats: ALL_FORMATS });
	try {
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
	} finally {
		// FilePathSource holds a real fd; releasing it here prevents EMFILE when bulk
		// imports read hundreds of files in a row.
		disposeInput(input);
	}
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

	try {
		// M4A/MP4 (AAC) can't go through Conversion: mediabunny has no AAC decoder under
		// Node, so Conversion discards the audio as `undecodable_source_codec`. The fix is
		// a true passthrough — copy the encoded packets straight across (no decode/encode),
		// which is all a tag-only rewrite needs. Other formats packet-copy fine via Conversion.
		if (ext === '.m4a' || ext === '.mp4' || ext === '.m4b' || ext === '.m4p') {
			// passthroughRemux owns the input's disposal in its own finally.
			await passthroughRemux(input, output, tags);
		} else {
			// Function-form tags merge onto the file's existing metadata; a static object
			// would drop every tag mediabunny doesn't re-supply (see mergeTags).
			const conversion = await Conversion.init({
				input,
				output,
				tags: (inputTags) => mergeTags(inputTags, tags)
			});
			try {
				await conversion.execute();
			} finally {
				disposeInput(input);
			}
		}

		renameSync(tmpPath, fullPath);
	} catch (err) {
		// Release the output's file handle (finalize() already closed it on the success
		// path) so the stranded temp file can be removed and no fd leaks.
		await output.cancel().catch(() => {});
		throw err;
	} finally {
		// A failed write (or a throw before rename) strands the temp file in
		// uploads/songs; on success it was renamed away and no longer exists.
		if (existsSync(tmpPath)) unlinkSync(tmpPath);
	}
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
		// setMetadataTags replaces all output metadata, so merge onto what the file
		// already carries (parity with the Conversion path's function-form tags).
		const existing = await input.getMetadataTags();
		const merged = mergeTags(existing, tags);

		const track = await input.getPrimaryAudioTrack();
		if (!track) throw new Error('no audio track to copy');
		const codec = await track.getCodec();
		if (!codec) throw new Error('unknown audio codec');
		const decoderConfig = await track.getDecoderConfig();

		output.setMetadataTags(merged);
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
		disposeInput(input);
	}
}
