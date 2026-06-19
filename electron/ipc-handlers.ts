import { shell } from 'electron';
import type { Handler } from './ipc';
import { API_CHANNELS } from './channels';
import { saveBase64, deleteFile, cleanupFiles } from './files';
import { staticFilePath, uploadsFilePath } from './paths';
import { readMetadata } from './metadata';
import {
	createArtist,
	getArtists,
	getArtistsWithRelations,
	findArtistByName
} from './domain/artists';
import {
	createAlbum,
	getAlbumsWithSongs,
	getAlbumWithArtists,
	resolveOrCreateAlbum,
	findAlbumByName,
	uploadAlbumArt
} from './domain/albums';
import {
	createProducerWithAliases,
	updateProducerWithAliases,
	deleteProducer,
	getProducersWithAliases,
	writeProducerMetadata,
	loadProducerPatterns,
	matchProducersFromFilename
} from './domain/producers';
import {
	createSong,
	updateSong,
	deleteSong,
	getSongReadable,
	getSongsReadable,
	getSongsCount,
	writeSongMetadata,
	writeAlbumMetadata
} from './domain/songs';
import { getSettings, updateSettings } from './domain/settings';
import {
	uploadAndExtractMetadata,
	createSongsWithMetadata,
	uploadSongs
} from './domain/workflows';
import { getInitialData } from './domain/initial-data';

// US1 (import + organize) + US2 (edit + write-back) handler map. Arg order mirrors
// RawWailsAppBindings so the renderer transport (bindings.ts) reaches these unchanged.
// Keyed by channel string.
export const us1Handlers: Partial<Record<string, Handler>> = {
	// App
	[API_CHANNELS.GetInitialData]: (d) => getInitialData(d.db),

	// Artists
	[API_CHANNELS.CreateArtist]: (d, input) => createArtist(d.db, input),
	[API_CHANNELS.GetArtists]: (d) => getArtists(d.db),
	[API_CHANNELS.GetArtistsWithRelations]: (d) => getArtistsWithRelations(d.db),
	[API_CHANNELS.FindArtistByName]: (d, name) => findArtistByName(d.db, name),

	// Albums
	[API_CHANNELS.CreateAlbum]: (d, input) => createAlbum(d.db, input),
	[API_CHANNELS.GetAlbumsWithSongs]: (d, limit, offset) => getAlbumsWithSongs(d.db, limit, offset),
	[API_CHANNELS.GetAlbumWithArtists]: (d, albumId) => getAlbumWithArtists(d.db, albumId),
	[API_CHANNELS.ResolveOrCreateAlbum]: (d, name, artistIds, opts) =>
		resolveOrCreateAlbum(d.db, name, artistIds, opts).album,
	[API_CHANNELS.FindAlbumByName]: (d, name) => findAlbumByName(d.db, name),
	[API_CHANNELS.UploadAlbumArt]: (d, albumId, filename, base64Data) =>
		uploadAlbumArt(d.db, d.staticPath, albumId, filename, base64Data),

	// Producers
	[API_CHANNELS.CreateProducerWithAliases]: (d, input) => createProducerWithAliases(d.db, input),
	[API_CHANNELS.UpdateProducerWithAliases]: (d, input) => updateProducerWithAliases(d.db, input),
	[API_CHANNELS.DeleteProducer]: (d, producerId) => deleteProducer(d.db, producerId),
	[API_CHANNELS.GetProducersWithAliases]: (d) => getProducersWithAliases(d.db),
	[API_CHANNELS.WriteProducerMetadata]: (d, producerId) =>
		writeProducerMetadata(d.db, d.staticPath, producerId),
	[API_CHANNELS.LoadProducerPatterns]: (d) => loadProducerPatterns(d.db),
	[API_CHANNELS.MatchProducersFromFilename]: (d, filename, songArtistIds) =>
		matchProducersFromFilename(d.db, filename, songArtistIds),

	// Songs
	[API_CHANNELS.CreateSong]: (d, input) => createSong(d.db, input),
	[API_CHANNELS.UpdateSong]: (d, input) => updateSong(d.db, input),
	[API_CHANNELS.DeleteSong]: (d, songId) => deleteSong(d.db, d.staticPath, songId),
	[API_CHANNELS.GetSongReadable]: (d, songId) => getSongReadable(d.db, songId),
	[API_CHANNELS.GetSongsReadable]: (d, limit, offset) => getSongsReadable(d.db, limit, offset),
	[API_CHANNELS.GetSongsCount]: (d) => getSongsCount(d.db),

	// Metadata
	[API_CHANNELS.ExtractMetadata]: (d, relPath) =>
		readMetadata(staticFilePath(d.staticPath, relPath)),
	[API_CHANNELS.WriteSongMetadata]: (d, songId) => writeSongMetadata(d.db, d.staticPath, songId),
	[API_CHANNELS.WriteAlbumMetadata]: (d, albumId) =>
		writeAlbumMetadata(d.db, d.staticPath, albumId),

	// Settings
	[API_CHANNELS.GetSettings]: (d) => getSettings(d.db),
	[API_CHANNELS.UpdateSettings]: (d, input) => updateSettings(d.db, input),

	// Files
	[API_CHANNELS.SaveUploadedFile]: (d, filename, base64Data) =>
		saveBase64(d.staticPath, 'songs', filename, base64Data),
	[API_CHANNELS.SaveArtwork]: (d, filename, base64Data) =>
		saveBase64(d.staticPath, 'artwork', filename, base64Data),
	[API_CHANNELS.DeleteFile]: (d, relPath) => deleteFile(d.staticPath, relPath),
	[API_CHANNELS.CleanupFiles]: (d, relPaths) => cleanupFiles(d.staticPath, relPaths),
	[API_CHANNELS.ShowInFileExplorer]: (d, relPath) =>
		shell.showItemInFolder(uploadsFilePath(d.staticPath, relPath)),

	// Workflows
	[API_CHANNELS.UploadAndExtractMetadata]: (d, files, albumId) =>
		uploadAndExtractMetadata(d.db, d.staticPath, files, albumId ?? null),
	[API_CHANNELS.CreateSongsWithMetadata]: (d, input) =>
		createSongsWithMetadata(d.db, d.staticPath, input),
	[API_CHANNELS.UploadSongs]: (d, files, albumId) =>
		uploadSongs(d.db, d.staticPath, files, albumId ?? null)
};
