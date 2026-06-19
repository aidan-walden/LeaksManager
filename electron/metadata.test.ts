import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALL_FORMATS, FilePathSource, Input, type MetadataTags } from 'mediabunny';

import { readMetadata, writeMetadata } from './metadata';

// SC-002 round-trip parity test (T029). Mirrors the Go oracle
// backend/metadata_adapters_test.go: for each of the 4 writable formats, write
// tags + embedded artwork via the metadata engine, re-read, and assert the
// written fields survive and the audio is still decodable.

let ffmpeg: string | null = null;
try {
	execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
	ffmpeg = 'ffmpeg';
} catch {
	ffmpeg = null;
}

let dir: string;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'metadata-roundtrip-'));
});

afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

// makeSilentAudio synthesizes a tiny audio file in the requested codec/container
// (mirror of the Go test helper). Returns the path.
function makeSilentAudio(name: string, codec: string, ext: string): string {
	const out = join(dir, name + ext);
	const args = [
		'-hide_banner',
		'-loglevel',
		'error',
		'-f',
		'lavfi',
		'-i',
		'sine=frequency=440:duration=0.4:sample_rate=44100',
		'-ac',
		'2',
		'-c:a',
		codec
	];
	if (codec === 'vorbis') args.push('-strict', 'experimental');
	if (ext === '.m4a') args.push('-movflags', '+faststart');
	args.push('-y', out);
	execFileSync('ffmpeg', args);
	return out;
}

// A tiny 8x8 magenta PNG (matches the Go makeArtwork fixture intent).
const PNG_8x8 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGNkYPjPgAcw4ZMcVgoA' +
		'pBwBfWsT9R0AAAAASUVORK5CYII=',
	'base64'
);

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
		images: [{ data: new Uint8Array(PNG_8x8), mimeType: 'image/png', kind: 'coverFront' }]
	};
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

interface FormatCase {
	name: string;
	codec: string;
	ext: string;
}

const cases: FormatCase[] = [
	{ name: 'MP3', codec: 'libmp3lame', ext: '.mp3' },
	{ name: 'M4A', codec: 'aac', ext: '.m4a' },
	{ name: 'FLAC', codec: 'flac', ext: '.flac' },
	{ name: 'Ogg/Vorbis', codec: 'vorbis', ext: '.ogg' }
];

describe('metadata round-trip parity (SC-002)', () => {
	for (const { name, codec, ext } of cases) {
		it(`${name}: written tags + artwork survive and audio stays intact`, async () => {
			if (!ffmpeg) return; // ffmpeg unavailable: skip like the Go oracle does

			const path = makeSilentAudio(name.replace(/\W/g, '_'), codec, ext);
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

			// Embedded artwork must survive.
			expect(got.artwork, 'expected embedded artwork to survive').not.toBeNull();
			expect(got.artwork!.mimeType).toMatch(/^image\//);
			expect(Buffer.from(got.artwork!.data, 'base64').length).toBeGreaterThan(0);

			// Audio stream must remain intact.
			await assertAudioIntact(path);
		});
	}
});
