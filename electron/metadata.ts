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
	type InputAudioTrack,
	Mp3OutputFormat,
	Mp4OutputFormat,
	OggOutputFormat,
	Output,
	type MetadataTags,
	type OutputFormat
} from 'mediabunny';
import type { ExtractedMetadata } from './domain/models';

// Single metadata engine replacing the legacy per-format adapter stack.
// File-level only: DB → tags (buildSongTags, inheritance/singles) lives in US2/T032.

export { type MetadataTags } from 'mediabunny';

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
//
// Known limitation (parity with the Go backend): because buildSongTags only sets keys
// with a non-empty DB value, a merge can never *clear* a tag. Emptying e.g. genre in the
// app leaves the file's old genre untouched. Clearing would require emitting explicit
// empty/sentinel values here — deliberately not done, to match prior behavior.
function mergeTags(inputTags: MetadataTags, overrides: MetadataTags): MetadataTags {
	return { ...inputTags, ...overrides, raw: { ...inputTags.raw, ...overrides.raw } };
}

// readMetadata replaces ExtractMetadata's tag read (parity with dhowden/tag).
export async function readMetadata(fullPath: string): Promise<ExtractedMetadata> {
	const input = new Input({ source: new FilePathSource(fullPath), formats: ALL_FORMATS });
	try {
		const tags = await input.getMetadataTags();

		// mediabunny computes duration from the container rather than the tags. Kept as
		// fractional seconds to match the Go oracle (float64) and the REAL `duration`
		// column. A file that can't report a positive duration stays null.
		let duration: number | null = null;
		try {
			const seconds = await input.computeDuration();
			if (Number.isFinite(seconds) && seconds > 0) duration = seconds;
		} catch {
			duration = null;
		}

		const image = tags.images?.[0];
		return {
			title: tags.title ?? null,
			artist: tags.artist ?? null,
			album: tags.album ?? null,
			year: tags.date ? tags.date.getFullYear() : null,
			genre: tags.genre ?? null,
			trackNumber: tags.trackNumber ?? null,
			duration,
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
// tags, then atomically replaces the original.
export async function writeMetadata(fullPath: string, tags: MetadataTags): Promise<void> {
	const format = outputFormatForExt(extname(fullPath));
	const tmpPath = `${fullPath}.tmp-${Date.now()}`;

	const input = new Input({ source: new FilePathSource(fullPath), formats: ALL_FORMATS });
	let output: Output | null = null;

	try {
		try {
			const track = await input.getPrimaryAudioTrack();
			if (!track) throw new Error('no audio track to copy');

			// FilePathTarget opens the temp file on construction, and Output.cancel can't close
			// it before start(). So create the output only after the input proves readable.
			output = new Output({ format, target: new FilePathTarget(tmpPath) });

			// M4A/MP4 (AAC) can't go through Conversion: mediabunny has no AAC decoder under
			// Node, so Conversion discards the audio as `undecodable_source_codec`. The fix is
			// a true passthrough — copy the encoded packets straight across (no decode/encode),
			// which is all a tag-only rewrite needs. Other formats packet-copy fine via Conversion.
			if (format instanceof Mp4OutputFormat) {
				await passthroughRemux(input, track, output, tags);
			} else {
				// Function-form tags merge onto the file's existing metadata; a static object
				// would drop every tag mediabunny doesn't re-supply (see mergeTags).
				const conversion = await Conversion.init({
					input,
					output,
					tags: (inputTags) => mergeTags(inputTags, tags)
				});
				await conversion.execute();
			}
		} finally {
			disposeInput(input);
		}

		renameSync(tmpPath, fullPath);
	} catch (err) {
		// Release the output's file handle (finalize() already closed it on the success
		// path) so the stranded temp file can be removed and no fd leaks.
		await output?.cancel().catch(() => {});
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
	track: InputAudioTrack,
	output: Output,
	tags: MetadataTags
): Promise<void> {
	// setMetadataTags replaces all output metadata, so merge onto what the file
	// already carries (parity with the Conversion path's function-form tags).
	const existing = await input.getMetadataTags();
	const merged = mergeTags(existing, tags);

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
}
