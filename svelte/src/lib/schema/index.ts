import * as z from 'zod';

export const artworkDataSchema = z.object({
	data: z.string(),
	mimeType: z.string()
});

export const createAlbumSchema = z.object({
	name: z.string().min(1),
	artistIds: z
		.string()
		.transform((str) => str.split(',').map((str) => str.trim()))
		.transform((arr) => arr.map(Number))
		.pipe(z.array(z.number().int().positive())),
	genre: z.preprocess((v) => v || undefined, z.string().min(1).optional()),
	year: z.preprocess(
		(v) => (v === '' || v === null ? undefined : v),
		z.coerce.number().int().optional()
	)
});

export const updateAlbumSchema = z.object({
	id: z.coerce.number().int().positive(),
	name: z.string().min(1),
	artistIds: z
		.string()
		.transform((str) => str.split(',').map((str) => str.trim()))
		.transform((arr) => arr.map(Number))
		.pipe(z.array(z.number().int().positive())),
	year: z.preprocess(
		(v) => (v === '' || v === null ? undefined : v),
		z.coerce.number().int().optional()
	),
	genre: z.preprocess((v) => v || undefined, z.string().min(1).optional())
});

const editableArtistSchema = z
	.object({
		id: z.number().int().positive(),
		name: z.string().min(1)
	})
	.catchall(z.unknown());

const editableAlbumArtistSchema = z
	.object({
		artistId: z.number().int().positive(),
		order: z.number().int().optional().nullable(),
		artist: editableArtistSchema.nullable().optional()
	})
	.catchall(z.unknown());

export const editableAlbumSchema = z
	.object({
		id: z.number().int().positive(),
		name: z.string().min(1),
		artworkPath: z.string().nullish(),
		genre: z.string().nullish(),
		year: z.number().int().nullable().optional(),
		albumArtists: z.array(editableAlbumArtistSchema).optional()
	})
	.catchall(z.unknown());

export type EditableAlbum = z.infer<typeof editableAlbumSchema>;

export const createArtistSchema = z.object({
	name: z.string().min(1),
	careerStart: z.preprocess((v) => v || undefined, z.string().min(1).optional()),
	careerEnd: z.preprocess((v) => v || undefined, z.string().min(1).optional())
});

export const aliasSchema = z.object({
	name: z.string().min(1),
	artistIds: z.array(z.number().int().positive()).optional().default([])
});

export const createProducerSchema = z.object({
	name: z.string().min(1),
	aliases: z.array(aliasSchema).optional().default([])
});

export const updateProducerSchema = z.object({
	id: z.coerce.number().int().positive(),
	name: z.string().min(1),
	aliases: z.array(aliasSchema).optional().default([])
});

export type CreateProducerData = z.infer<typeof createProducerSchema>;
export type AliasData = z.infer<typeof aliasSchema>;

const editableProducerAliasArtistSchema = z
	.object({
		artistId: z.number().int().positive(),
		artist: editableArtistSchema.nullish()
	})
	.catchall(z.unknown());

const editableProducerAliasSchema = z
	.object({
		id: z.number().int().positive(),
		alias: z.string().min(1),
		producerAliasArtists: z.array(editableProducerAliasArtistSchema).optional()
	})
	.catchall(z.unknown());

export const editableProducerSchema = z
	.object({
		id: z.number().int().positive(),
		name: z.string().min(1),
		producerAliases: z.array(editableProducerAliasSchema).optional()
	})
	.catchall(z.unknown());

export type EditableProducer = z.infer<typeof editableProducerSchema>;

export const uploadArtSchema = z.object({
	file: z.instanceof(File),
	type: z.enum(['album', 'artist']),
	id: z.coerce.number().int().positive()
});

export const uploadSongsSchema = z.object({
	files: z.array(z.instanceof(File)),
	albumId: z.preprocess(
		(v) => (v === null || v === '' ? undefined : v),
		z.coerce.number().int().positive().optional()
	)
});

export const updateSongSchema = z.object({
	name: z.string().min(1),
	artistIds: z
		.string()
		.transform((str) => str.split(',').map((str) => str.trim()))
		.transform((arr) => arr.map(Number))
		.pipe(z.array(z.number().int().positive())),
	producerIds: z
		.string()
		.optional()
		.transform((str) => (str && str.trim() ? str.split(',').map((s) => s.trim()) : []))
		.transform((arr) => arr.map(Number).filter((n) => !isNaN(n)))
		.pipe(z.array(z.number().int().positive())),
	album: z.string().min(1),
	albumId: z.preprocess(
		(v) => (v === null || v === '' ? undefined : v),
		z.coerce.number().int().positive().optional()
	),
	trackNumber: z.preprocess(
		(v) => (v === null || v === '' ? null : v),
		z.coerce.number().int().positive().nullable()
	),
	songId: z.coerce.number().int().positive()
});

export const deleteRecordByIdSchema = z.object({
	id: z.coerce.number().int().positive()
});

export const uploadAndExtractMetadataSchema = z.object({
	files: z.array(z.instanceof(File)),
	albumId: z.preprocess(
		(v) => (v === null || v === '' ? undefined : v),
		z.coerce.number().int().positive().optional()
	)
});

export const fileDataSchema = z.object({
	albumId: z.number().int().positive().optional(),
	originalFilename: z.string().min(1),
	filepath: z.string().min(1),
	metadata: z.object({
		title: z.string().nullish(),
		artist: z.string().nullish(),
		album: z.string().nullish(),
		year: z.number().int().positive().nullish(),
		genre: z.string().nullish(),
		trackNumber: z.number().int().positive().nullish(),
		producer: z.string().nullish(),
		duration: z.number().nullish(),
		artwork: artworkDataSchema.nullish()
	}),
	parsedArtists: z.array(z.string().min(1)).optional(),
	parsedProducers: z.array(z.string().min(1)).optional(),
	hasUnmappedArtists: z.boolean()
});

export type FileData = z.infer<typeof fileDataSchema>;

export const createSongsWithMetadataSchema = z.object({
	albumId: z.preprocess(
		(v) => (v === null || v === '' ? undefined : v),
		z.coerce.number().int().positive().optional()
	),
	filesData: z
		.string()
		.transform((str) => JSON.parse(str))
		.pipe(z.array(fileDataSchema).min(1)),
	artistMapping: z
		.string()
		.nullable()
		.transform((v) => (v && v.trim() ? JSON.parse(v) : {})) as z.ZodType<
		Record<string, number | 'CREATE_NEW'>
	>,
	useEmbeddedArtwork: z.preprocess((v) => v === 'true' || v === true, z.boolean())
});

// Microservice API Schemas

export const extractMetadataRequestSchema = z.object({
	filepath: z.string().min(1)
});

export const extractedMetadataSchema = z.object({
	title: z.string().nullish(),
	artist: z.string().nullish(),
	albumArtist: z.string().nullish(),
	album: z.string().nullish(),
	year: z.number().int().nullish(),
	genre: z.string().nullish(),
	trackNumber: z.number().int().nullish(),
	producer: z.string().nullish(),
	duration: z.number().nullish(),
	artwork: artworkDataSchema.nullish()
});

export const writeMetadataResponseSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	song_id: z.number().int().positive(),
	metadata_written: z.object({
		title: z.string().nullish(),
		artist: z.string().nullish(),
		albumartist: z.string().nullish(),
		album: z.string().nullish(),
		genre: z.string().nullish(),
		year: z.number().int().nullish(),
		producers: z.string().nullish(),
		track_number: z.number().int().nullish()
	})
});

export type ExtractMetadataRequest = z.infer<typeof extractMetadataRequestSchema>;
export type ArtworkData = z.infer<typeof artworkDataSchema>;
export type ExtractedMetadata = z.infer<typeof extractedMetadataSchema>;
export type WriteMetadataResponse = z.infer<typeof writeMetadataResponseSchema>;

// Settings Schema

export const updateSettingsSchema = z.object({
	clearTrackNumberOnUpload: z.boolean().optional(),
	importToAppleMusic: z.boolean().optional(),
	automaticallyMakeSingles: z.boolean().optional()
});

// export interface FileData {
// 	albumId?: number;
// 	originalFilename: string;
// 	filepath: string;
// 	metadata: {
// 		title?: string;
// 		artist?: string;
// 		album?: string;
// 		year?: number;
// 		genre?: string;
// 		trackNumber?: number;
// 		producer?: string;
// 		duration?: number;
// 		artwork?: {
// 			data: string;
// 			mimeType: string;
// 		};
// 	};
// 	parsedArtists: string[];
// 	hasUnmappedArtists: boolean;
// }
