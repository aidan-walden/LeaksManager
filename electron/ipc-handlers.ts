import { shell } from 'electron';
import type { Handler } from './ipc';
import type { ApiName } from './channels';
import { cleanupFiles } from './files';
import { uploadsFilePath } from './paths';
import { createArtist } from './domain/artists';
import {
	createAlbum,
	updateAlbum,
	deleteAlbum,
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
	writeAlbumMetadata
} from './domain/songs';
import { updateSettings } from './domain/settings';
import { uploadAndExtractMetadata, createSongsWithMetadata } from './domain/workflows';
import { getInitialData } from './domain/initial-data';
import { syncSongsToAppleMusic } from './apple-music';

// One handler per API_CHANNELS entry; the Record type makes a missing handler a compile
// error. Arg order mirrors RawIpcBindings so the renderer reaches these unchanged.
export const handlers: Record<ApiName, Handler> = {
	// App
	GetInitialData: (d) => getInitialData(d.db),

	// Artists
	CreateArtist: (d, input) => createArtist(d.db, input),

	// Albums
	CreateAlbum: (d, input) => createAlbum(d.db, input),
	UpdateAlbum: (d, input) => updateAlbum(d.db, input),
	DeleteAlbum: (d, albumId) => deleteAlbum(d.db, albumId),
	UploadAlbumArt: (d, albumId, filename, base64Data) =>
		uploadAlbumArt(d.db, d.staticPath, albumId, filename, base64Data),

	// Producers
	CreateProducerWithAliases: (d, input) => createProducerWithAliases(d.db, input),
	UpdateProducerWithAliases: (d, input) => updateProducerWithAliases(d.db, input),
	DeleteProducer: (d, producerId) => deleteProducer(d.db, producerId),
	WriteProducerMetadata: (d, producerId) => writeProducerMetadata(d.db, d.staticPath, producerId),

	// Songs
	UpdateSong: (d, input) => updateSong(d.db, input),
	DeleteSong: (d, songId) => deleteSong(d.db, d.staticPath, songId),
	GetSongsReadable: (d, limit, offset) => getSongsReadable(d.db, limit, offset),
	GetSongsCount: (d) => getSongsCount(d.db),

	// Metadata
	WriteSongMetadata: (d, songId) => writeSongMetadata(d.db, d.staticPath, songId),
	WriteAlbumMetadata: (d, albumId) => writeAlbumMetadata(d.db, d.staticPath, albumId),

	// Settings
	UpdateSettings: (d, input) => updateSettings(d.db, input),

	// Files
	CleanupFiles: (d, relPaths) => cleanupFiles(d.staticPath, relPaths),
	// uploadsFilePath (not staticFilePath): the untrusted renderer relPath must be
	// confined to the uploads/ subtree. staticFilePath only blocks ../ and absolute
	// paths, which would still let a relPath like "local.db" reach files elsewhere
	// under userData. Callers already pass "uploads/..." paths.
	ShowInFileExplorer: (d, relPath) => shell.showItemInFolder(uploadsFilePath(d.staticPath, relPath)),

	// Workflows
	UploadAndExtractMetadata: (d, files, albumId) =>
		uploadAndExtractMetadata(d.db, d.staticPath, files, albumId ?? null),
	CreateSongsWithMetadata: (d, input) => createSongsWithMetadata(d.db, d.staticPath, input),

	// Apple Music
	SyncSongsToAppleMusic: (d) => syncSongsToAppleMusic(d)
};
