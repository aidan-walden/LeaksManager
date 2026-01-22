// types matching Go structs in app.go

export interface ArtworkData {
	data: string; // base64
	mimeType: string;
}

export interface ExtractedMetadata {
	title: string;
	artist: string;
	albumArtist: string;
	album: string;
	year: number;
	genre: string;
	trackNumber: number;
	producer: string;
	duration: number;
	artwork: ArtworkData | null;
}

export interface BatchResult {
	success: boolean;
	message: string;
	songsProcessed: number;
	songsFailed: number;
	results: SongProcessingResult[];
}

export interface SongProcessingResult {
	songId: number;
	success: boolean;
	error?: string;
}

export interface Artist {
	id: number;
	name: string;
	image: string | null;
	careerStartYear: number | null;
	careerEndYear: number | null;
	createdAt: number;
	updatedAt: number;
	synced: boolean;
}

export interface ArtistWithRelations extends Artist {
	albums: Album[];
	songs: Song[];
}

export interface Album {
	id: number;
	name: string;
	artworkPath: string | null;
	genre: string | null;
	year: number | null;
	createdAt: number;
	updatedAt: number;
	synced: boolean;
}

export interface AlbumWithArtists extends Album {
	artists: Artist[];
}

export interface AlbumWithSongs extends Album {
	artists: Artist[];
	songs: Song[];
}

export interface Song {
	id: number;
	name: string;
	albumId: number | null;
	artworkPath: string | null;
	genre: string | null;
	year: number | null;
	trackNumber: number | null;
	duration: number | null;
	filepath: string;
	fileType: string | null;
	createdAt: number;
	updatedAt: number;
	synced: boolean;
}

export interface SongReadable extends Song {
	artist: string;
	artists: Artist[];
	producers: Producer[];
	album: Album | null;
}

export interface Producer {
	id: number;
	name: string;
	createdAt: number;
	updatedAt: number;
}

export interface ProducerAlias {
	id: number;
	producerId: number;
	alias: string;
	createdAt: number;
}

export interface ProducerAliasWithArtists extends ProducerAlias {
	artistIds: number[];
}

export interface ProducerWithAliases extends Producer {
	aliases: ProducerAliasWithArtists[];
	songs: Song[];
}

export interface Settings {
	id: number;
	clearTrackNumberOnUpload: boolean;
	importToAppleMusic: boolean;
	automaticallyMakeSingles: boolean;
	updatedAt: number;
}

export interface Limits {
	songsPerPage: number;
	albumsPerPage: number;
}

export interface InitialData {
	songs: SongReadable[];
	songsCount: number;
	albums: AlbumWithSongs[];
	artists: ArtistWithRelations[];
	producers: ProducerWithAliases[];
	settings: Settings;
	isMac: boolean;
	limits: Limits;
	hasUnsyncedChanges: boolean;
}

// input types

export interface CreateArtistInput {
	name: string;
	careerStartYear?: number;
	careerEndYear?: number;
}

export interface CreateAlbumInput {
	name: string;
	artistIds: number[];
	year?: number;
	genre?: string;
}

export interface UpdateAlbumInput {
	id: number;
	name?: string;
	year?: number;
	genre?: string;
	artistIds: number[];
}

export interface CreateSongInput {
	name: string;
	filepath: string;
	artistIds: number[];
	producerIds: number[];
	albumId?: number;
	artworkPath?: string;
	genre?: string;
	year?: number;
	trackNumber?: number;
	duration?: number;
}

export interface UpdateSongInput {
	id: number;
	name?: string;
	albumId?: number;
	artistIds: number[];
	producerIds: number[];
	trackNumber?: number;
}

export interface AliasInput {
	name: string;
	artistIds: number[];
}

export interface CreateProducerInput {
	name: string;
	aliases: AliasInput[];
}

export interface UpdateProducerInput {
	id: number;
	name: string;
	aliases: AliasInput[];
}

export interface UpdateSettingsInput {
	clearTrackNumberOnUpload?: boolean;
	importToAppleMusic?: boolean;
	automaticallyMakeSingles?: boolean;
}

export interface FileData {
	originalFilename: string;
	filepath: string;
	metadata: ExtractedMetadata;
	parsedArtists: string[];
	hasUnmappedArtists: boolean;
	albumId?: number;
}

export interface UploadAndExtractResult {
	filesData: FileData[];
	unmappedArtists: string[];
	filesWithArtwork: number;
}

export interface CreateSongsWithMetadataInput {
	filesData: FileData[];
	artistMapping: Record<string, number | 'CREATE_NEW'>;
	albumId?: number;
	useEmbeddedArtwork: boolean;
}

export interface FileUpload {
	filename: string;
	base64Data: string;
}
