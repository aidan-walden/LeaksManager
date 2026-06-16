import type Database from 'better-sqlite3';
import type { InitialData } from './models';
import { getSongsReadable, getSongsCount } from './songs';
import { getAlbumsWithSongs } from './albums';
import { getArtistsWithRelations } from './artists';
import { getProducersWithAliases } from './producers';
import { getSettings } from './settings';

// Port of backend/initial_data.go — the payload for the renderer's layout load.

const SONGS_PER_PAGE = 25;
const ALBUMS_PER_PAGE = 25;

export function getInitialData(db: Database.Database): InitialData {
	const settings = getSettings(db);
	return {
		songs: getSongsReadable(db, SONGS_PER_PAGE, 0),
		songsCount: getSongsCount(db),
		albums: getAlbumsWithSongs(db, ALBUMS_PER_PAGE, 0),
		artists: getArtistsWithRelations(db),
		producers: getProducersWithAliases(db),
		settings,
		isMac: process.platform === 'darwin',
		limits: { songsPerPage: SONGS_PER_PAGE, albumsPerPage: ALBUMS_PER_PAGE },
		hasUnsyncedChanges: checkUnsyncedChanges(db, settings.importToAppleMusic)
	};
}

// True when Apple Music import is on and at least one song is dirty (synced = 0).
export function checkUnsyncedChanges(db: Database.Database, importToAppleMusic: boolean): boolean {
	if (!importToAppleMusic) return false;
	const { c } = db.prepare(`SELECT COUNT(*) AS c FROM songs WHERE synced = 0`).get() as {
		c: number;
	};
	return c > 0;
}
