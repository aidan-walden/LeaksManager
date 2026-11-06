import type Database from 'better-sqlite3';
import type {
	Song,
	AlbumWithArtists,
	SongImportDraft,
	FileUpload,
	UploadAndExtractResult,
	CreateSongsWithMetadataInput,
	CreateSongInput,
	DownloadSourceSongsResult,
	ExtractedMetadata,
	SourceDownloadFailure,
	SourceDownloadProgress,
	SourceSong
} from './models';
import type { SongSource } from '../sources/song-source';
import { saveBase64, saveStream, cleanupFiles } from '../files';
import { staticFilePath } from '../paths';
import { readMetadata } from '../metadata';
import { parseArtists, createArtist, findArtistByName } from './artists';
import { findAlbumByName, getAlbumWithArtists } from './albums';
import { matchProducersFromCredits, matchProducersFromFilename } from './producers';
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

async function readMetadataOrEmpty(staticPath: string, relPath: string): Promise<ExtractedMetadata> {
	try {
		return await readMetadata(staticFilePath(staticPath, relPath));
	} catch {
		return emptyMeta();
	}
}

// Flags which artists are unmapped and maps files to existing albums by name.
function summarizeDrafts(
	db: Database.Database,
	files: Pick<SongImportDraft, 'originalFilename' | 'filepath' | 'metadata' | 'producerCredits'>[],
	albumId: number | null
): UploadAndExtractResult {
	const filesData: SongImportDraft[] = [];
	const unmappedArtists = new Set<string>();
	let filesWithArtwork = 0;

	for (const file of files) {
		const { metadata } = file;
		const parsedArtists = parseArtists(metadata.artist);
		const unmapped = parsedArtists.filter((name) => !findArtistByName(db, name));
		for (const name of unmapped) unmappedArtists.add(name);

		if (metadata.artwork) filesWithArtwork++;

		const album = albumId == null && metadata.album ? findAlbumByName(db, metadata.album) : null;

		filesData.push({
			...file,
			parsedArtists,
			hasUnmappedArtists: unmapped.length > 0,
			albumId: album?.id
		});
	}

	return { filesData, unmappedArtists: [...unmappedArtists], filesWithArtwork };
}

// First step of the metadata-extraction workflow: save + extract + parse.
export async function uploadAndExtractMetadata(
	db: Database.Database,
	staticPath: string,
	files: FileUpload[],
	albumId: number | null
): Promise<UploadAndExtractResult> {
	const saved = [];
	for (const file of files) {
		const filepath = saveBase64(staticPath, 'songs', file.filename, file.base64Data);
		saved.push({
			originalFilename: file.filename,
			filepath,
			metadata: await readMetadataOrEmpty(staticPath, filepath)
		});
	}
	return summarizeDrafts(db, saved, albumId);
}

// The source's catalog is curated, so it wins over file tags. The file's own duration
// is measured, so it wins over the catalog's.
function applySourceMetadata(file: ExtractedMetadata, song: SourceSong): ExtractedMetadata {
	return {
		...file,
		title: song.name,
		artist: song.artists.length > 0 ? song.artists.join(', ') : file.artist,
		album: song.album ?? file.album,
		year: song.year ?? file.year,
		duration: file.duration ?? song.duration
	};
}

export interface DownloadSourceSongsOptions {
	signal?: AbortSignal;
	onProgress?: (progress: Omit<SourceDownloadProgress, 'downloadId'>) => void;
}

// Byte progress can arrive thousands of times per song. Each report crosses IPC.
const BYTE_PROGRESS_INTERVAL_MS = 200;

// Alternate first step for songs from a source: download + extract + parse. Downloads run
// one at a time to limit load on the source. A failed song does not stop the batch. A
// cancel stops the current song, removes its partial file, and starts no other songs.
export async function downloadSourceSongs(
	db: Database.Database,
	staticPath: string,
	source: SongSource,
	songIds: string[],
	albumId: number | null,
	{ signal, onProgress }: DownloadSourceSongsOptions = {}
): Promise<DownloadSourceSongsResult> {
	const saved = [];
	const failures: SourceDownloadFailure[] = [];
	let completedSongs = 0;

	const report = (
		song: Pick<SourceDownloadProgress, 'songId' | 'songName' | 'bytesDownloaded' | 'bytesTotal'>
	) => onProgress?.({ completedSongs, totalSongs: songIds.length, ...song });
	const idle = { songId: null, songName: null, bytesDownloaded: 0, bytesTotal: null };

	for (const songId of songIds) {
		if (signal?.aborted) break;
		report({ ...idle, songId });
		try {
			const { song, filename, size, body } = await source.downloadSong(songId, signal);
			const current = { songId, songName: song.name, bytesTotal: size };
			report({ ...current, bytesDownloaded: 0 });

			let bytesDownloaded = 0;
			let lastReportAt = Date.now();
			const filepath = await saveStream(staticPath, 'songs', filename, body, (byteCount) => {
				bytesDownloaded += byteCount;
				if (Date.now() - lastReportAt >= BYTE_PROGRESS_INTERVAL_MS) {
					lastReportAt = Date.now();
					report({ ...current, bytesDownloaded });
				}
			});
			saved.push({
				originalFilename: filename,
				filepath,
				metadata: applySourceMetadata(await readMetadataOrEmpty(staticPath, filepath), song),
				producerCredits: song.producers
			});
		} catch (err) {
			if (signal?.aborted) break;
			failures.push({ songId, error: err instanceof Error ? err.message : String(err) });
		}
		completedSongs++;
		report(idle);
	}

	return {
		...summarizeDrafts(db, saved, albumId),
		failures,
		cancelled: signal?.aborted ?? false
	};
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
		const producerIds = new Set([
			...matchProducersFromFilename(db, fd.originalFilename, artistIds),
			...matchProducersFromCredits(db, fd.producerCredits ?? [], artistIds)
		]);
		const songInput: CreateSongInput = {
			name: metadata.title || fd.originalFilename,
			filepath: fd.filepath,
			artistIds,
			producerIds: [...producerIds],
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
