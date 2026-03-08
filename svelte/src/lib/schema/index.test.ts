import { describe, expect, it } from 'vitest';
import { createSongsWithMetadataSchema } from './index';

const serializedFileData = JSON.stringify([
	{
		albumId: 1,
		originalFilename: 'track.mp3',
		filepath: 'uploads/songs/track.mp3',
		metadata: {
			title: 'Track',
			artist: 'Artist',
			albumArtist: 'Artist',
			album: 'Album',
			year: 2024,
			genre: 'Hip-Hop',
			trackNumber: 1,
			producer: 'Producer',
			duration: 123.45,
			artwork: null
		},
		parsedArtists: ['Artist'],
		parsedProducers: ['Producer'],
		hasUnmappedArtists: false
	}
]);

describe('createSongsWithMetadataSchema', () => {
	it('parses serialized workflow payloads', () => {
		const result = createSongsWithMetadataSchema.parse({
			albumId: '1',
			filesData: serializedFileData,
			artistMapping: JSON.stringify({ Artist: 7, Guest: 'CREATE_NEW' }),
			useEmbeddedArtwork: 'true'
		});

		expect(result.albumId).toBe(1);
		expect(result.filesData[0]?.metadata.title).toBe('Track');
		expect(result.artistMapping).toEqual({ Artist: 7, Guest: 'CREATE_NEW' });
		expect(result.useEmbeddedArtwork).toBe(true);
	});

	it('reports invalid filesData JSON instead of throwing', () => {
		const result = createSongsWithMetadataSchema.safeParse({
			filesData: '{bad json',
			artistMapping: null,
			useEmbeddedArtwork: false
		});

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('expected schema parse failure');
		}
		expect(result.error.issues[0]?.message).toContain('filesData must be valid JSON');
	});

	it('reports invalid artistMapping JSON instead of throwing', () => {
		const result = createSongsWithMetadataSchema.safeParse({
			filesData: serializedFileData,
			artistMapping: '{bad json',
			useEmbeddedArtwork: false
		});

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('expected schema parse failure');
		}
		expect(result.error.issues[0]?.message).toContain('artistMapping must be valid JSON');
	});

	it('rejects artistMapping values that were only asserted previously', () => {
		const result = createSongsWithMetadataSchema.safeParse({
			filesData: serializedFileData,
			artistMapping: JSON.stringify({ Artist: 'not-an-id' }),
			useEmbeddedArtwork: false
		});

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('expected schema parse failure');
		}
		expect(result.error.issues[0]?.path).toEqual(['artistMapping', 'Artist']);
	});
});
