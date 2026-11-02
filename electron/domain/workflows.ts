import type Database from 'better-sqlite3';
import type {
	Song,
	AlbumWithArtists,
	SongImportDraft,
	FileUpload,
	UploadAndExtractResult,
	CreateSongsWithMetadataInput,
	CreateSongInput,
	ExtractedMetadata
} from './models';
import { saveBase64, cleanupFiles } from '../files';
import { staticFilePath } from '../paths';
import { readMetadata } from '../metadata';
import { parseArtists, createArtist, findArtistByName } from './artists';
import { findAlbumByName, getAlbumWithArtists } from './albums';
import { matchProducersFromFilename } from './producers';
import { createSong, writeSongMetadata } from './songs';
import { getSettings } from './settings';

function emptyMeta(): ExtractedMetadata {
	return {
		title: null,
		artist: null,
		album: null,
		year: null,
		genre: null,
		trackNumber: null,
		duration: null,
		artwork: null
	};
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
			return saveBase64(staticPath, 'artwork', `artwork.${ext}`, metadata.artwork.data);
		} catch {
			return null;
		}
	}
	if (album && album.artworkPath) {
		return album.artworkPath;
	}
	return null;
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
	const unmappedArtists = new Set<string>();
	let filesWithArtwork = 0;

	for (const file of files) {
		const relPath = saveBase64(staticPath, 'songs', file.filename, file.base64Data);

		let metadata: ExtractedMetadata;
		try {
			metadata = await readMetadata(staticFilePath(staticPath, relPath));
		} catch {
			metadata = emptyMeta();
		}

		const parsedArtists = parseArtists(metadata.artist);
		const unmapped = parsedArtists.filter((name) => !findArtistByName(db, name));
		for (const name of unmapped) unmappedArtists.add(name);

		if (metadata.artwork) filesWithArtwork++;

		const album = albumId == null && metadata.album ? findAlbumByName(db, metadata.album) : null;

		filesData.push({
			originalFilename: file.filename,
			filepath: relPath,
			metadata,
			parsedArtists,
			hasUnmappedArtists: unmapped.length > 0,
			albumId: album?.id
		});
	}

	return { filesData, unmappedArtists: [...unmappedArtists], filesWithArtwork };
}

// Second step: resolve the artist mapping (CREATE_NEW → new artist), inherit album
// artists/artwork, and create songs.
export async function createSongsWithMetadata(
	db: Database.Database,
	staticPath: string,
	input: CreateSongsWithMetadataInput
): Promise<Song[]> {
	const settings = getSettings(db);

	const mappedArtistIds = new Map<string, number>();
	for (const [artistName, resolution] of Object.entries(input.artistMapping)) {
		mappedArtistIds.set(
			artistName,
			resolution === 'CREATE_NEW' ? createArtist(db, { name: artistName }).id : resolution
		);
	}

	const created: Song[] = [];
	for (const fd of input.filesData) {
		const albumId = input.albumId ?? fd.albumId ?? null;
		const album = albumId != null ? getAlbumWithArtists(db, albumId) : null;

		const parsedArtistIds = fd.parsedArtists.flatMap((name) => {
			const id = mappedArtistIds.get(name) ?? findArtistByName(db, name)?.id;
			return id !== undefined ? [id] : [];
		});
		// A file with no known artists inherits its album's artists.
		const artistIds =
			parsedArtistIds.length === 0 && album ? album.artists.map((a) => a.id) : parsedArtistIds;

		const { metadata } = fd;
		const songInput: CreateSongInput = {
			name: metadata.title || fd.originalFilename,
			filepath: fd.filepath,
			artistIds,
			producerIds: matchProducersFromFilename(db, fd.originalFilename, artistIds),
			albumId,
			artworkPath: resolveUploadArtwork(staticPath, input.useEmbeddedArtwork, metadata, album),
			genre: metadata.genre || null,
			year: (metadata.year ?? 0) > 0 ? metadata.year : null,
			trackNumber:
				!settings.clearTrackNumberOnUpload && (metadata.trackNumber ?? 0) > 0
					? metadata.trackNumber
					: null,
			duration: (metadata.duration ?? 0) > 0 ? metadata.duration : null
		};

		// Each createSong commits on its own. Skip a failed file and remove its saved
		// upload, so the rest of the batch still imports and nothing is left orphaned.
		let song: Song;
		try {
			song = createSong(db, songInput);
		} catch (err) {
			console.error(`createSong failed for ${fd.originalFilename}:`, err);
			cleanupFiles(staticPath, [fd.filepath]);
			continue;
		}
		created.push(song);

		// The song stays created if its tags can't be written, such as for an unsupported format.
		await writeSongMetadata(db, staticPath, song.id);
	}
	return created;
}
