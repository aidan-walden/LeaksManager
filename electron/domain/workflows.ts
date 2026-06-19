import type Database from 'better-sqlite3';
import type {
	Song,
	Settings,
	AlbumWithArtists,
	SongImportDraft,
	FileUpload,
	UploadAndExtractResult,
	CreateSongsWithMetadataInput,
	CreateSongInput
} from './models';
import type { ExtractedMetadata } from '../metadata';
import { saveUploadedFile, saveArtwork } from '../files';
import { staticFilePath } from '../paths';
import { readMetadata } from '../metadata';
import { parseArtists, createArtist, findArtistByName } from './artists';
import { findAlbumByName, getAlbumWithArtists } from './albums';
import { matchProducersFromFilename } from './producers';
import { createSong } from './songs';
import { getSettings } from './settings';

// Port of backend/workflows.go. NOTE (US1/US2 boundary): createSongsFromSpecs does
// NOT write tags back to files here — buildSongTags + write-back is US2 (T032).
// Song records + artwork resolution are created; the embedded-tag write is deferred.

function emptyMeta(): ExtractedMetadata {
	return {
		title: null,
		artist: null,
		albumArtist: null,
		album: null,
		year: null,
		genre: null,
		trackNumber: null,
		producer: null,
		duration: null,
		artwork: null
	};
}

interface SongCreationSpec {
	filepath: string;
	originalFilename: string;
	metadata: ExtractedMetadata;
	artistIds: number[];
	albumId: number | null;
	artworkPath: string | null;
	matchProducers: boolean;
}

// Picks artwork for an uploaded song: embedded when requested + present (falling
// back to none if it can't be saved), otherwise the album's artwork.
function resolveUploadArtwork(
	staticPath: string,
	useEmbedded: boolean,
	metadata: ExtractedMetadata,
	album: AlbumWithArtists | null
): string | null {
	if (useEmbedded && metadata.artwork) {
		const ext = metadata.artwork.mimeType === 'image/png' ? 'png' : 'jpg';
		try {
			return saveArtwork(staticPath, `artwork.${ext}`, metadata.artwork.data);
		} catch {
			return null;
		}
	}
	if (album && album.artworkPath) {
		return album.artworkPath;
	}
	return null;
}

// Shared core of both upload flows: create a song per spec. A metadata write
// failure does not abort the batch in Go; in US1 the write-back is deferred (T032).
function createSongsFromSpecs(
	db: Database.Database,
	specs: SongCreationSpec[],
	settings: Settings
): Song[] {
	const created: Song[] = [];
	for (const spec of specs) {
		const producerIds = spec.matchProducers
			? matchProducersFromFilename(db, spec.originalFilename, spec.artistIds)
			: [];

		const trackNumber =
			!settings.clearTrackNumberOnUpload && (spec.metadata.trackNumber ?? 0) > 0
				? spec.metadata.trackNumber
				: null;

		const input: CreateSongInput = {
			name: spec.metadata.title || spec.originalFilename,
			filepath: spec.filepath,
			artistIds: spec.artistIds,
			producerIds,
			albumId: spec.albumId,
			artworkPath: spec.artworkPath,
			genre: spec.metadata.genre || null,
			year: (spec.metadata.year ?? 0) > 0 ? spec.metadata.year : null,
			trackNumber,
			duration: (spec.metadata.duration ?? 0) > 0 ? spec.metadata.duration : null
		};

		created.push(createSong(db, input));
		// US2: write metadata back to file here (buildSongTags + writeMetadata, T032).
	}
	return created;
}

// First step of the metadata-extraction workflow: save + extract + parse, flag
// which artists are unmapped, and map files to existing albums by name.
export async function uploadAndExtractMetadata(
	db: Database.Database,
	staticPath: string,
	files: FileUpload[],
	albumId: number | null
): Promise<UploadAndExtractResult> {
	const filesData: SongImportDraft[] = [];
	const allArtistNames = new Set<string>();
	const allAlbumNames = new Set<string>();
	let filesWithArtwork = 0;

	for (const file of files) {
		const relPath = saveUploadedFile(staticPath, file.filename, file.base64Data);

		let metadata: ExtractedMetadata;
		try {
			metadata = await readMetadata(staticFilePath(staticPath, relPath));
		} catch {
			metadata = emptyMeta();
		}

		const parsed = parseArtists(metadata.artist);
		for (const name of parsed) allArtistNames.add(name);

		if (albumId == null && metadata.album) allAlbumNames.add(metadata.album);
		if (metadata.artwork) filesWithArtwork++;

		filesData.push({
			originalFilename: file.filename,
			filepath: relPath,
			metadata,
			parsedArtists: parsed,
			hasUnmappedArtists: false
		});
	}

	// Which collected artists already exist (lowercase → id).
	const existing = new Map<string, number>();
	for (const name of allArtistNames) {
		const artist = findArtistByName(db, name);
		if (artist) existing.set(name.toLowerCase(), artist.id);
	}

	const unmappedArtists: string[] = [];
	for (const name of allArtistNames) {
		if (!existing.has(name.toLowerCase())) unmappedArtists.push(name);
	}

	for (const fd of filesData) {
		fd.hasUnmappedArtists = fd.parsedArtists.some((a) => !existing.has(a.toLowerCase()));
	}

	if (albumId == null) {
		for (const albumName of allAlbumNames) {
			const album = findAlbumByName(db, albumName);
			if (album) {
				for (const fd of filesData) {
					if (fd.metadata.album && fd.metadata.album.toLowerCase() === albumName.toLowerCase()) {
						fd.albumId = album.id;
					}
				}
			}
		}
	}

	return { filesData, unmappedArtists, filesWithArtwork };
}

// Second step: resolve the artist mapping (CREATE_NEW → new artist), inherit album
// artists/artwork, and create songs.
export function createSongsWithMetadata(
	db: Database.Database,
	staticPath: string,
	input: CreateSongsWithMetadataInput
): Song[] {
	const settings = getSettings(db);

	const artistIdMap = new Map<string, number>();
	for (const [artistName, resolution] of Object.entries(input.artistMapping)) {
		if (resolution === 'CREATE_NEW') {
			artistIdMap.set(artistName, createArtist(db, { name: artistName }).id);
		} else if (typeof resolution === 'number') {
			artistIdMap.set(artistName, resolution);
		}
	}

	// Fill in existing artists not present in the mapping.
	for (const fd of input.filesData) {
		for (const artistName of fd.parsedArtists) {
			if (!artistIdMap.has(artistName)) {
				const artist = findArtistByName(db, artistName);
				if (artist) artistIdMap.set(artistName, artist.id);
			}
		}
	}

	const album = input.albumId != null ? getAlbumWithArtists(db, input.albumId) : null;

	const specs: SongCreationSpec[] = input.filesData.map((fd) => {
		const songArtistIds: number[] = [];
		for (const artistName of fd.parsedArtists) {
			const id = artistIdMap.get(artistName);
			if (id !== undefined) songArtistIds.push(id);
		}

		let currentAlbum = album;
		if (currentAlbum == null && fd.albumId != null) {
			currentAlbum = getAlbumWithArtists(db, fd.albumId);
		}

		// Inherit album artists when the file has none from metadata.
		let finalArtistIds = songArtistIds;
		if (finalArtistIds.length === 0 && currentAlbum) {
			finalArtistIds = currentAlbum.artists.map((a) => a.id);
		}

		const finalAlbumId = input.albumId != null ? input.albumId : (fd.albumId ?? null);

		return {
			filepath: fd.filepath,
			originalFilename: fd.originalFilename,
			metadata: fd.metadata,
			artistIds: finalArtistIds,
			albumId: finalAlbumId,
			artworkPath: resolveUploadArtwork(staticPath, input.useEmbeddedArtwork, fd.metadata, currentAlbum),
			matchProducers: true
		};
	});

	return createSongsFromSpecs(db, specs, settings);
}

// Simple upload without metadata preview.
export async function uploadSongs(
	db: Database.Database,
	staticPath: string,
	files: FileUpload[],
	albumId: number | null
): Promise<Song[]> {
	const settings = getSettings(db);

	let album: AlbumWithArtists | null = null;
	let artistIds: number[] = [];
	if (albumId != null) {
		album = getAlbumWithArtists(db, albumId);
		if (album) artistIds = album.artists.map((a) => a.id);
	}

	const specs: SongCreationSpec[] = [];
	for (const file of files) {
		const relPath = saveUploadedFile(staticPath, file.filename, file.base64Data);

		let metadata: ExtractedMetadata;
		try {
			metadata = await readMetadata(staticFilePath(staticPath, relPath));
		} catch {
			metadata = emptyMeta();
		}

		specs.push({
			filepath: relPath,
			originalFilename: file.filename,
			metadata,
			artistIds,
			albumId,
			artworkPath: resolveUploadArtwork(staticPath, false, metadata, album),
			matchProducers: false
		});
	}

	return createSongsFromSpecs(db, specs, settings);
}
