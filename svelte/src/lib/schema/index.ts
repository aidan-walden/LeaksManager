import * as z from 'zod';

export const createAlbumSchema = z.object({
	name: z.string().min(1),
	artistIds: z
		.string()
		.transform((str) => str.split(',').map((str) => str.trim()))
		.transform((arr) => arr.map(Number))
		.pipe(z.array(z.number().int().positive())),
	year: z.string().min(1)
});

export const createArtistSchema = z.object({
	name: z.string().min(1),
	careerStart: z.string().min(1).optional(),
	careerEnd: z.string().min(1).optional()
});

export const uploadArtSchema = z.object({
	file: z.instanceof(File),
	type: z.enum(['album', 'artist']),
	id: z.coerce.number().int().positive()
});

export const uploadSongsSchema = z.object({
	files: z.array(z.instanceof(File)),
	albumId: z.coerce.number().int().positive()
});

export const updateSongSchema = z.object({
	name: z.string().min(1),
	artistIds: z
		.string()
		.transform((str) => str.split(',').map((str) => str.trim()))
		.transform((arr) => arr.map(Number))
		.pipe(z.array(z.number().int().positive())),
	album: z.string().min(1),
	songId: z.coerce.number().int().positive()
});

export const deleteSongSchema = z.object({
	id: z.coerce.number().int().positive()
});

export const uploadAndExtractMetadataSchema = z.object({
	files: z.array(z.instanceof(File)),
	uploadToAlbum: z.coerce.boolean()
});
