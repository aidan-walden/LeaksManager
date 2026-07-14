import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	ALL_FORMATS,
	AudioSample,
	AudioSampleSource,
	FilePathSource,
	FilePathTarget,
	Input,
	Mp4OutputFormat,
	Output,
	type MetadataTags
} from 'mediabunny';

import { readMetadata, writeMetadata } from './metadata';

// SC-002 round-trip parity: write tags + embedded artwork via mediabunny, re-read,
// and assert the written fields survive and the audio is still demuxable.

let dir: string;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'metadata-roundtrip-'));
});

afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

async function makeSilentM4a(name: string): Promise<string> {
	const out = join(dir, `${name}.m4a`);
	const output = new Output({ format: new Mp4OutputFormat(), target: new FilePathTarget(out) });
	const source = new AudioSampleSource({ codec: 'pcm-s16' });
	output.addAudioTrack(source);
	await output.start();

	const frames = 4410;
	const sample = new AudioSample({
		data: new Int16Array(frames * 2),
		format: 's16',
		numberOfChannels: 2,
		sampleRate: 44100,
		timestamp: 0
	});
	await source.add(sample);
	sample.close();
	await output.finalize();
	return out;
}

// A tiny 8x8 magenta PNG (matches the Go makeArtwork fixture intent).
const PNG_8x8 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGNkYPjPgAcw4ZMcVgoA' +
		'pBwBfWsT9R0AAAAASUVORK5CYII=',
	'base64'
);

// The `, `-joined producer names buildSongTags emits, and the per-format `raw` keys it
// writes them under (ID3 TCOM, MP4 ©wrt, Vorbis PRODUCER). mediabunny writes only the
// key matching the output format, so all three are always set.
const PRODUCERS = 'Prod One, Prod Two';
const PRODUCER_RAW = { TCOM: PRODUCERS, '©wrt': PRODUCERS, PRODUCER: PRODUCERS };

// mediabunny can only *encode* PCM under Node (no mp3/flac/vorbis/opus encoders), and
// only Mp4 accepts a PCM codec — so mp3/flac/ogg sources can't be synthesized here.
// These are tiny (~0.05–0.2s) silent, metadata-stripped clips generated with ffmpeg,
// base64-embedded so the test stays self-contained (no ffmpeg at runtime). writeMetadata
// packet-copies their encoded audio through Conversion, exercising the real write path.
const FIXTURE_MP3 =
	'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYyLjEyLjEwMgAAAAAAAAAAAAAA/+NIwAAAAAAAAAAAAEluZm8AAAAPAAAAAwAABIAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA////////////////////////////////////////////AAAAAExhdmM2Mi4yOAAAAAAAAAAAAAAAACQC8AAAAAAAAASAV7kNnwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+NIxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+NIxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+NIxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
const FIXTURE_FLAC =
	'ZkxhQwAAACIAwADAAAALAAAMAfQA8AAABkCfCt/b50DLnNgYijV2HiR2hAAALg0AAABMYXZmNjIuMTIuMTAyAQAAABUAAABlbmNvZGVyPUxhdmY2Mi4xMi4xMDL/+BQIACsAAADpW//4FAgBLAAAAIUj//gUCAIlAAAAMav/+BQIAyIAAABd0//4FAgENwAAANi+//gUCAUwAAAAtMb/+BQIBjkAAAAATv/4FAgHPgAAAGw2//hkCAg/9gAAAKYF';
const FIXTURE_OGG =
	'T2dnUwACAAAAAAAAAAANrpKnAAAAAHLc9eYBE09wdXNIZWFkAQE4AUAfAAAAAABPZ2dTAAAAAAAAAAAAAA2ukqcBAAAAkc+v0AE+T3B1c1RhZ3MNAAAATGF2ZjYyLjEyLjEwMgEAAAAdAAAAZW5jb2Rlcj1MYXZjNjIuMjguMTAyIGxpYm9wdXNPZ2dTAASYCgAAAAAAAA2ukqcCAAAAENVV8AMHBgYIC+S5oLyECAfGsw7GCAfGsw7G';

// Writes a base64-embedded fixture to disk and returns its path.
function writeFixture(name: string, ext: string, base64: string): string {
	const out = join(dir, `${name}.${ext}`);
	writeFileSync(out, Buffer.from(base64, 'base64'));
	return out;
}

function sampleTags(): MetadataTags {
	return {
		title: 'Test Title',
		artist: 'Test Artist',
		albumArtist: 'Various Artists',
		album: 'Test Album',
		genre: 'Hip-Hop',
		// Local-time mid-year so readMetadata's date.getFullYear() (local tz) can't
		// straddle a year boundary regardless of the machine's timezone.
		date: new Date(2024, 5, 15),
		trackNumber: 3,
		tracksTotal: 10,
		images: [{ data: new Uint8Array(PNG_8x8), mimeType: 'image/png', kind: 'coverFront' }],
		raw: { ...PRODUCER_RAW }
	};
}

// Reads a single raw metadata key straight from the file (readMetadata doesn't surface
// producers), disposing the input so the round-trip suite can't leak fds.
async function readRawTag(path: string, key: string): Promise<unknown> {
	const input = new Input({ source: new FilePathSource(path), formats: ALL_FORMATS });
	try {
		return (await input.getMetadataTags()).raw?.[key];
	} finally {
		input.dispose();
	}
}

// Assert the audio stream survived the metadata write: the file still demuxes to
// a primary audio track with a positive duration. (We deliberately don't assert
// track.canDecode() — that probes decoder availability in the host env, not stream
// integrity, and there's no audio decoder wired up under plain Node/vitest. A
// corrupt remux would fail to demux here, which is the integrity signal we want —
// mirroring the Go oracle, which proves intactness by reading the file back.)
async function assertAudioIntact(path: string): Promise<void> {
	const input = new Input({ source: new FilePathSource(path), formats: ALL_FORMATS });
	const track = await input.getPrimaryAudioTrack();
	expect(track, 'expected a primary audio track after write').not.toBeNull();
	expect(await input.computeDuration()).toBeGreaterThan(0);
}

// Each format writes producers under a different native raw key; mediabunny only writes
// the one matching the output container (verified against mediabunny's writer source).
const CASES: {
	format: string;
	ext: string;
	producerKey: string;
	makeSource(name: string): Promise<string>;
}[] = [
	{ format: 'MP3', ext: 'mp3', producerKey: 'TCOM', makeSource: async (n) => writeFixture(n, 'mp3', FIXTURE_MP3) },
	{ format: 'FLAC', ext: 'flac', producerKey: 'PRODUCER', makeSource: async (n) => writeFixture(n, 'flac', FIXTURE_FLAC) },
	{ format: 'M4A', ext: 'm4a', producerKey: '©wrt', makeSource: (n) => makeSilentM4a(n) },
	{ format: 'OGG', ext: 'ogg', producerKey: 'PRODUCER', makeSource: async (n) => writeFixture(n, 'ogg', FIXTURE_OGG) }
];

describe('metadata round-trip parity (SC-002)', () => {
	for (const { format, ext, producerKey, makeSource } of CASES) {
		it(`${format}: written tags + artwork + producers survive and audio stays intact`, async () => {
			const path = await makeSource(`roundtrip-${ext}`);
			const tags = sampleTags();

			await writeMetadata(path, tags);
			const got = await readMetadata(path);

			expect(got.title).toBe('Test Title');
			expect(got.artist).toBe('Test Artist');
			expect(got.albumArtist).toBe('Various Artists');
			expect(got.album).toBe('Test Album');
			expect(got.genre).toBe('Hip-Hop');
			expect(got.year).toBe(2024);
			expect(got.trackNumber).toBe(3);
			// readMetadata now computes duration (fractional seconds) rather than null.
			expect(got.duration).toBeGreaterThan(0);

			expect(got.artwork, 'expected embedded artwork to survive').not.toBeNull();
			expect(got.artwork!.mimeType).toMatch(/^image\//);
			expect(Buffer.from(got.artwork!.data, 'base64').length).toBeGreaterThan(0);

			// Producers round-trip via the format's native composer/producer raw key.
			expect(
				await readRawTag(path, producerKey),
				`expected producers under raw['${producerKey}'] for ${format}`
			).toBe(PRODUCERS);

			await assertAudioIntact(path);
		});
	}

	it('merge preserves existing raw tags instead of replacing all metadata', async () => {
		// Seed a file with a producer credit, then write unrelated tags — the producer
		// must survive (writes must MERGE, not replace, per the old backend's behavior).
		const path = await makeSilentM4a('merge');
		await writeMetadata(path, { raw: { '©wrt': 'Original Producer' } });

		await writeMetadata(path, { title: 'New Title' });
		const got = await readMetadata(path);

		expect(got.title).toBe('New Title');
		expect(await readRawTag(path, '©wrt')).toBe('Original Producer');
	});
});
