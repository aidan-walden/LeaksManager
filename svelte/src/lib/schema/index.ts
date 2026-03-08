import * as z from 'zod';

const parseJsonValue = <T>(
	value: string,
	ctx: z.RefinementCtx,
	fieldName: string
): T | typeof z.NEVER => {
	try {
		return JSON.parse(value) as T;
	} catch {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `${fieldName} must be valid JSON`
		});
		return z.NEVER;
	}
};

export const artworkDataSchema = z.object({
	data: z.string(),
	mimeType: z.string()
});

const artistMappingValueSchema = z.record(
	z.string(),
	z.union([z.number().int().positive(), z.literal('CREATE_NEW')])
);

const commaSeparatedPositiveIntArray = () =>
	z
		.string()
		.transform((str) => str.split(',').map((part) => part.trim()))
		.transform((parts) => parts.map(Number))
		.pipe(z.array(z.number().int().positive()));

const optionalCommaSeparatedPositiveIntArray = () =>
	z
		.string()
		.optional()
		.transform((str) => (str && str.trim() ? str.split(',').map((part) => part.trim()) : []))
		.transform((parts) => parts.map(Number).filter((value) => !isNaN(value)))
		.pipe(z.array(z.number().int().positive()));

export const createAlbumSchema = z.object({
	name: z.string().min(1),
	artistIds: commaSeparatedPositiveIntArray(),
	genre: z.preprocess((v) => v || undefined, z.string().min(1).optional()),
	year: z.preprocess(
		(v) => (v === '' || v === null ? undefined : v),
		z.coerce.number().int().optional()
	)
});

export const updateAlbumSchema = z.object({
	id: z.coerce.number().int().positive(),
	name: z.string().min(1),
	artistIds: commaSeparatedPositiveIntArray(),
	year: z.preprocess(
		(v) => (v === '' || v === null ? undefined : v),
		z.coerce.number().int().optional()
	),
	genre: z.preprocess((v) => v || undefined, z.string().min(1).optional())
});

export const editableArtistSchema = z
	.object({
		id: z.number().int().positive(),
		name: z.string().min(1),
		careerStartYear: z.number().int().nullable().optional(),
		careerEndYear: z.number().int().nullable().optional(),
		image: z.string().nullish()
	})
	.catchall(z.unknown());

export type EditableArtist = z.infer<typeof editableArtistSchema>;

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
	artistIds: commaSeparatedPositiveIntArray(),
	producerIds: optionalCommaSeparatedPositiveIntArray(),
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
		albumArtist: z.string().nullish(),
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

export const createSongsWithMetadataSchema = z.object({
	albumId: z.preprocess(
		(v) => (v === null || v === '' ? undefined : v),
		z.coerce.number().int().positive().optional()
	),
	filesData: z
		.string()
		.transform((str, ctx) => parseJsonValue<unknown>(str, ctx, 'filesData'))
		.pipe(z.array(fileDataSchema).min(1)),
	artistMapping: z
		.string()
		.nullable()
		.transform((v, ctx) =>
			v && v.trim()
				? parseJsonValue<unknown>(v, ctx, 'artistMapping')
				: {}
		)
		.pipe(artistMappingValueSchema),
	useEmbeddedArtwork: z.preprocess((v) => v === 'true' || v === true, z.boolean())
});
export const updateSettingsSchema = z.object({
	clearTrackNumberOnUpload: z.boolean().optional(),
	importToAppleMusic: z.boolean().optional(),
	automaticallyMakeSingles: z.boolean().optional()
});
