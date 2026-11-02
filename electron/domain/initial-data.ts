import type Database from 'better-sqlite3';
import type { InitialData } from './models';
import { getSongsReadable, getSongsCount } from './songs';
import { getAlbumSummaries } from './albums';
import { getArtists } from './artists';
import { getProducersWithAliases } from './producers';
import { getSettings, isMac } from './settings';

// The payload for the renderer's layout load.

const SONGS_PER_PAGE = 25;

export function getInitialData(db: Database.Database): InitialData {
	const settings = getSettings(db);
	return {
		songs: getSongsReadable(db, SONGS_PER_PAGE, 0),
		songsCount: getSongsCount(db),
		albums: getAlbumSummaries(db),
		artists: getArtists(db),
		producers: getProducersWithAliases(db),
		settings,
		isMac: isMac(),
		songsPerPage: SONGS_PER_PAGE,
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
