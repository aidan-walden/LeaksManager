import { shell } from 'electron';
import type { Handler } from './ipc';
import { API_CHANNELS } from './channels';
import { cleanupFiles } from './files';
import { uploadsFilePath } from './paths';
import { readMetadata } from './metadata';
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
	getProducersWithAliases,
	writeProducerMetadata,
	matchProducersFromFilename
} from './domain/producers';
import {
	createSong,
	updateSong,
	deleteSong,
	getSongsReadable,
	getSongsCount,
	writeSongMetadata,
	writeAlbumMetadata
} from './domain/songs';
import { updateSettings } from './domain/settings';
import {
	uploadAndExtractMetadata,
	createSongsWithMetadata,
	uploadSongs
} from './domain/workflows';
import { getInitialData } from './domain/initial-data';
import { getAppleMusicLibrary, syncSongsToAppleMusic } from './apple-music';

// US1 (import + organize) + US2 (edit + write-back) handler map. Arg order mirrors
// RawIpcBindings so the renderer reaches these unchanged.
// Keyed by channel string.
export const us1Handlers: Partial<Record<string, Handler>> = {
	// App
	[API_CHANNELS.GetInitialData]: (d) => getInitialData(d.db),

	// Artists
	[API_CHANNELS.CreateArtist]: (d, input) => createArtist(d.db, input),

	// Albums
	[API_CHANNELS.CreateAlbum]: (d, input) => createAlbum(d.db, input),
	[API_CHANNELS.UpdateAlbum]: (d, input) => updateAlbum(d.db, input),
	[API_CHANNELS.DeleteAlbum]: (d, albumId) => deleteAlbum(d.db, albumId),
	[API_CHANNELS.UploadAlbumArt]: (d, albumId, filename, base64Data) =>
		uploadAlbumArt(d.db, d.staticPath, albumId, filename, base64Data),

	// Producers
	[API_CHANNELS.CreateProducerWithAliases]: (d, input) => createProducerWithAliases(d.db, input),
	[API_CHANNELS.UpdateProducerWithAliases]: (d, input) => updateProducerWithAliases(d.db, input),
	[API_CHANNELS.DeleteProducer]: (d, producerId) => deleteProducer(d.db, producerId),
	[API_CHANNELS.GetProducersWithAliases]: (d) => getProducersWithAliases(d.db),
	[API_CHANNELS.WriteProducerMetadata]: (d, producerId) =>
		writeProducerMetadata(d.db, d.staticPath, producerId),
	[API_CHANNELS.MatchProducersFromFilename]: (d, filename, songArtistIds) =>
		matchProducersFromFilename(d.db, filename, songArtistIds),

	// Songs
	[API_CHANNELS.CreateSong]: (d, input) => createSong(d.db, input),
	[API_CHANNELS.UpdateSong]: (d, input) => updateSong(d.db, input),
	[API_CHANNELS.DeleteSong]: (d, songId) => deleteSong(d.db, d.staticPath, songId),
	[API_CHANNELS.GetSongsReadable]: (d, limit, offset) => getSongsReadable(d.db, limit, offset),
	[API_CHANNELS.GetSongsCount]: (d) => getSongsCount(d.db),

	// Metadata
	// uploadsFilePath (not staticFilePath): the untrusted renderer relPath must be
	// confined to the uploads/ subtree. staticFilePath only blocks ../ and absolute
	// paths, which would still let a relPath like "local.db" read files elsewhere
	// under userData. Callers already pass "uploads/..." paths.
	[API_CHANNELS.ExtractMetadata]: (d, relPath) =>
		readMetadata(uploadsFilePath(d.staticPath, relPath)),
	[API_CHANNELS.WriteSongMetadata]: (d, songId) => writeSongMetadata(d.db, d.staticPath, songId),
	[API_CHANNELS.WriteAlbumMetadata]: (d, albumId) =>
		writeAlbumMetadata(d.db, d.staticPath, albumId),

	// Settings
	[API_CHANNELS.UpdateSettings]: (d, input) => updateSettings(d.db, input),

	// Files
	[API_CHANNELS.CleanupFiles]: (d, relPaths) => cleanupFiles(d.staticPath, relPaths),
	[API_CHANNELS.ShowInFileExplorer]: (d, relPath) =>
		shell.showItemInFolder(uploadsFilePath(d.staticPath, relPath)),

	// Workflows
	[API_CHANNELS.UploadAndExtractMetadata]: (d, files, albumId) =>
		uploadAndExtractMetadata(d.db, d.staticPath, files, albumId ?? null),
	[API_CHANNELS.CreateSongsWithMetadata]: (d, input) =>
		createSongsWithMetadata(d.db, d.staticPath, input),
	[API_CHANNELS.UploadSongs]: (d, files, albumId) =>
		uploadSongs(d.db, d.staticPath, files, albumId ?? null),

	// Apple Music
	[API_CHANNELS.GetAppleMusicLibrary]: (d) =>
		getAppleMusicLibrary({ db: d.db, staticPath: d.staticPath, window: d.window }),
	[API_CHANNELS.SyncSongsToAppleMusic]: (d) =>
		syncSongsToAppleMusic({ db: d.db, staticPath: d.staticPath, window: d.window })
};
