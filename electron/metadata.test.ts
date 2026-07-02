import { mkdtempSync, rmSync } from 'node:fs';
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

describe('metadata round-trip parity (SC-002)', () => {
	it('M4A: written tags + artwork survive and audio stays intact', async () => {
		const path = await makeSilentM4a('m4a');
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

		expect(got.artwork, 'expected embedded artwork to survive').not.toBeNull();
		expect(got.artwork!.mimeType).toMatch(/^image\//);
		expect(Buffer.from(got.artwork!.data, 'base64').length).toBeGreaterThan(0);

		await assertAudioIntact(path);
	});
});
