import { shell } from 'electron';
import type { IpcDeps } from './ipc';
import type { ApiName } from './channels';
import type {
	CreateAlbumInput,
	CreateArtistInput,
	CreateProducerInput,
	CreateSongsWithMetadataInput,
	FileUpload,
	SourceBrowseQuery,
	UpdateAlbumInput,
	UpdateProducerInput,
	UpdateSettingsInput,
	UpdateSongInput
} from './domain/models';
import { cleanupFiles } from './files';
import { uploadsFilePath } from './paths';
import { createArtist } from './domain/artists';
import {
	createAlbum,
	updateAlbum,
	uploadAlbumArt
} from './domain/albums';
import {
	createProducerWithAliases,
	updateProducerWithAliases,
	deleteProducer,
	writeProducerMetadata
} from './domain/producers';
import {
	updateSong,
	deleteSong,
	getSongsReadable,
	getSongsCount,
	writeSongMetadata,
	writeAlbumMetadata,
	deleteAlbumAndClearTags
} from './domain/songs';
import { updateSettings } from './domain/settings';
import {
	uploadAndExtractMetadata,
	createSongsWithMetadata
} from './domain/workflows';
import { getSongSource, listSongSources } from './sources';
import { cancelSourceDownload, runSourceDownload } from './sources/download-runs';
import { getInitialData } from './domain/initial-data';
import { syncSongsToAppleMusic } from './apple-music';

// One handler per API_CHANNELS entry; `satisfies` makes a missing handler a compile
// error. IpcApi derives the renderer's window.api type from these signatures.
export const handlers = {
	// App
	GetInitialData: (d: IpcDeps) => getInitialData(d.db),

	// Artists
	CreateArtist: (d: IpcDeps, input: CreateArtistInput) => createArtist(d.db, input),

	// Albums
	CreateAlbum: (d: IpcDeps, input: CreateAlbumInput) => createAlbum(d.db, input),
	UpdateAlbum: (d: IpcDeps, input: UpdateAlbumInput) => updateAlbum(d.db, input),
	DeleteAlbum: (d: IpcDeps, albumId: number) =>
		deleteAlbumAndClearTags(d.db, d.staticPath, albumId),
	UploadAlbumArt: (d: IpcDeps, albumId: number, filename: string, base64Data: string) =>
		uploadAlbumArt(d.db, d.staticPath, albumId, filename, base64Data),

	// Producers
	CreateProducerWithAliases: (d: IpcDeps, input: CreateProducerInput) =>
		createProducerWithAliases(d.db, input),
	UpdateProducerWithAliases: (d: IpcDeps, input: UpdateProducerInput) =>
		updateProducerWithAliases(d.db, input),
	DeleteProducer: (d: IpcDeps, producerId: number) => deleteProducer(d.db, producerId),
	WriteProducerMetadata: (d: IpcDeps, producerId: number) =>
		writeProducerMetadata(d.db, d.staticPath, producerId),

	// Songs
	UpdateSong: (d: IpcDeps, input: UpdateSongInput) => updateSong(d.db, input),
	DeleteSong: (d: IpcDeps, songId: number) => deleteSong(d.db, d.staticPath, songId),
	GetSongsReadable: (d: IpcDeps, limit: number, offset: number) =>
		getSongsReadable(d.db, limit, offset),
	GetSongsCount: (d: IpcDeps) => getSongsCount(d.db),

	// Metadata
	WriteSongMetadata: (d: IpcDeps, songId: number) => writeSongMetadata(d.db, d.staticPath, songId),
	WriteAlbumMetadata: (d: IpcDeps, albumId: number) =>
		writeAlbumMetadata(d.db, d.staticPath, albumId),

	// Settings
	UpdateSettings: (d: IpcDeps, input: UpdateSettingsInput) => updateSettings(d.db, input),

	// Files
	CleanupFiles: (d: IpcDeps, relPaths: string[]) => cleanupFiles(d.staticPath, relPaths),
	// uploadsFilePath (not staticFilePath): the untrusted renderer relPath must be
	// confined to the uploads/ subtree. staticFilePath only blocks ../ and absolute
	// paths, which would still let a relPath like "local.db" reach files elsewhere
	// under userData. Callers already pass "uploads/..." paths.
	ShowInFileExplorer: (d: IpcDeps, relPath: string) =>
		shell.showItemInFolder(uploadsFilePath(d.staticPath, relPath)),

	// Workflows
	UploadAndExtractMetadata: (d: IpcDeps, files: FileUpload[], albumId: number | null) =>
		uploadAndExtractMetadata(d.db, d.staticPath, files, albumId),
	CreateSongsWithMetadata: (d: IpcDeps, input: CreateSongsWithMetadataInput) =>
		createSongsWithMetadata(d.db, d.staticPath, input),

	// Song sources
	GetSongSources: () => listSongSources(),
	GetSourceFilters: (_d: IpcDeps, sourceId: string) => getSongSource(sourceId).getFilters(),
	BrowseSource: (_d: IpcDeps, sourceId: string, query: SourceBrowseQuery) =>
		getSongSource(sourceId).browse(query),
	// The renderer picks downloadId, so it can match progress events and cancel from the start.
	DownloadSourceSongs: (
		d: IpcDeps,
		downloadId: string,
		sourceId: string,
		songIds: string[],
		albumId: number | null
	) => runSourceDownload(d, downloadId, getSongSource(sourceId), songIds, albumId),
	CancelSourceDownload: (_d: IpcDeps, downloadId: string) => cancelSourceDownload(downloadId),

	// Apple Music
	SyncSongsToAppleMusic: (d: IpcDeps) => syncSongsToAppleMusic(d)
} satisfies Record<ApiName, (deps: IpcDeps, ...args: never[]) => unknown>;

type WithoutDeps<Args extends unknown[]> = Args extends [IpcDeps, ...infer Rest] ? Rest : never;

// The renderer's view of each handler: no deps argument, and always a promise.
export type IpcApi = {
	[K in ApiName]: (
		...args: WithoutDeps<Parameters<(typeof handlers)[K]>>
	) => Promise<Awaited<ReturnType<(typeof handlers)[K]>>>;
};
