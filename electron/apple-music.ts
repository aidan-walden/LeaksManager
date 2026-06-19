import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { dialog, type BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import type { AppleMusicTrack, SyncResult, SyncItemResult, SongReadable } from './domain/models';
import { getSongReadable, writeSongMetadataInternal } from './domain/songs';
import { getSettings } from './domain/settings';
import { staticFilePath } from './paths';
import { now } from './domain/rows';

// Port of backend/apple_music.go. AppleScript runs via execFile('osascript', ['-e', script])
// (no shell — Go used exec.Command). macOS-only: process.platform replaces runtime.GOOS,
// and a disabled import setting is a graceful no-op (FR-013 / FR-016). Song titles/paths
// flow into scripts, so every interpolated value is escaped via escapeAppleScript — this
// is a trust boundary, mirroring the Go oracle exactly.

const isMac = (): boolean => process.platform === 'darwin';

const execFileP = promisify(execFile);

export interface AppleMusicDeps {
	db: Database.Database;
	staticPath: string;
	window?: BrowserWindow | null;
}

// escapeAppleScript escapes backslashes and double quotes for AppleScript string
// interpolation. Order matters: backslashes first.
export function escapeAppleScript(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isImportEnabled(db: Database.Database): boolean {
	if (!isMac()) return false;
	try {
		return getSettings(db).importToAppleMusic;
	} catch {
		return false;
	}
}

async function isAppleMusicRunning(): Promise<boolean> {
	try {
		await execFileP('pgrep', ['-x', 'Music']);
		return true;
	} catch {
		return false;
	}
}

async function ensureAppleMusicRunning(deps: AppleMusicDeps): Promise<void> {
	if (!isMac()) {
		throw new Error('Apple Music integration is only available on macOS');
	}
	if (!isImportEnabled(deps.db)) {
		return;
	}

	if (await isAppleMusicRunning()) {
		return;
	}

	if (!deps.window) {
		throw new Error('Apple Music is not running');
	}

	const { response } = await dialog.showMessageBox(deps.window, {
		type: 'question',
		title: 'Apple Music Closed',
		message: 'Apple Music needs to be open before continuing. Open Apple Music now?',
		buttons: ['Open Apple Music', 'Cancel'],
		defaultId: 0,
		cancelId: 1
	});
	if (response !== 0) {
		throw new Error('Apple Music must be open to continue');
	}

	try {
		await execFileP('open', ['-a', 'Music']);
	} catch (err) {
		throw new Error(`failed to open Apple Music: ${errMsg(err)}`);
	}

	for (let i = 0; i < 20; i++) {
		if (await isAppleMusicRunning()) {
			return;
		}
		await sleep(250);
	}

	throw new Error('Apple Music did not finish opening');
}

// runAppleScriptCommand mirrors the Go helper: no-op when import disabled, ensures Music
// is running, then runs osascript. Returns combined stdout (trimmed by callers).
async function runAppleScriptCommand(deps: AppleMusicDeps, script: string): Promise<string> {
	if (!isImportEnabled(deps.db)) {
		return '';
	}
	await ensureAppleMusicRunning(deps);

	try {
		const { stdout } = await execFileP('osascript', ['-e', script]);
		return stdout;
	} catch (err) {
		const e = err as { stderr?: string; message?: string };
		const out = (e.stderr ?? '').trim();
		console.error(
			`[AppleScript] osascript failed: ${e.message}\n[AppleScript] output:\n${out}\n[AppleScript] script:\n${formatAppleScriptForLog(script)}`
		);
		if (out.length > 0) {
			throw new Error(`${e.message}: ${out}`);
		}
		throw err;
	}
}

async function runAppleScriptOutput(deps: AppleMusicDeps, script: string): Promise<string> {
	return runAppleScriptCommand(deps, script);
}

async function runAppleScript(deps: AppleMusicDeps, script: string): Promise<void> {
	await runAppleScriptCommand(deps, script);
}

function formatAppleScriptForLog(script: string): string {
	return script
		.split('\n')
		.map((line, i) => `${String(i + 1).padStart(2, '0')}: ${line}`)
		.join('\n');
}

function errMsg(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

// GetAppleMusicLibrary fetches all user-saved tracks from Apple Music via AppleScript.
export async function getAppleMusicLibrary(deps: AppleMusicDeps): Promise<AppleMusicTrack[]> {
	if (!isMac()) {
		throw new Error('Apple Music integration is only available on macOS');
	}
	if (!isImportEnabled(deps.db)) {
		return [];
	}

	const script = `
		tell application "Music"
			set trackList to {}
			set allTracks to every track of playlist "Library"

			set output to ""

			repeat with t in allTracks
				try
					set tId to persistent ID of t
					set tName to name of t
					set tArtist to artist of t
					set tAlbumArtist to album artist of t
					set tAlbum to album of t
					set tGenre to genre of t
					set tYear to year of t
					set tDuration to duration of t
					set tTrackNumber to track number of t
					set tTrackCount to track count of t
					set tDiscNumber to disc number of t
					set tDiscCount to disc count of t

					set output to output & tId & "|||" & tName & "|||" & tArtist & "|||" & tAlbumArtist & "|||" & tAlbum & "|||" & tGenre & "|||" & tYear & "|||" & tDuration & "|||" & tTrackNumber & "|||" & tTrackCount & "|||" & tDiscNumber & "|||" & tDiscCount & "&&&"
				end try
			end repeat

			return output
		end tell
	`;

	let out: string;
	try {
		out = await runAppleScriptOutput(deps, script);
	} catch (err) {
		throw new Error(`failed to execute AppleScript: ${errMsg(err)}`);
	}

	if (out === '') {
		return [];
	}

	const tracks: AppleMusicTrack[] = [];

	const atoi = (v: string): number => {
		const n = parseInt(v, 10);
		return Number.isNaN(n) ? 0 : n;
	};
	const atof = (v: string): number => {
		const n = parseFloat(v);
		return Number.isNaN(n) ? 0 : n;
	};

	for (const ts of out.split('&&&')) {
		if (ts.trim() === '') continue;

		const props = ts.split('|||');
		if (props.length < 12) continue;

		tracks.push({
			id: props[0],
			databaseId: 0,
			name: props[1],
			artist: props[2],
			albumArtist: props[3],
			album: props[4],
			genre: props[5],
			year: atoi(props[6]),
			duration: atof(props[7]),
			trackNumber: atoi(props[8]),
			trackCount: atoi(props[9]),
			discNumber: atoi(props[10]),
			discCount: atoi(props[11])
		});
	}

	return tracks;
}

// SyncSongsToAppleMusic syncs all unsynced songs to Apple Music, returning detailed
// per-song results (successes, failures, errors). A single song's failure is captured
// in its result and must NOT mark that song synced.
export async function syncSongsToAppleMusic(deps: AppleMusicDeps): Promise<SyncResult> {
	if (!isMac()) {
		throw new Error('Apple Music sync is only available on macOS');
	}
	if (!isImportEnabled(deps.db)) {
		return { totalSongs: 0, successCount: 0, failureCount: 0, addedCount: 0, updatedCount: 0, results: [], completedAt: now() };
	}

	await ensureAppleMusicRunning(deps);

	const rows = deps.db
		.prepare(`SELECT id FROM songs WHERE synced = 0 ORDER BY id`)
		.all() as { id: number }[];
	const songIDs = rows.map((r) => r.id);

	const result: SyncResult = {
		totalSongs: songIDs.length,
		successCount: 0,
		failureCount: 0,
		addedCount: 0,
		updatedCount: 0,
		results: [],
		completedAt: now()
	};

	for (const songID of songIDs) {
		const itemResult = await syncSingleSong(deps, songID);
		result.results.push(itemResult);

		switch (itemResult.status) {
			case 'success':
			case 'added':
			case 'updated':
				result.successCount++;
				if (itemResult.status === 'added') result.addedCount++;
				else if (itemResult.status === 'updated') result.updatedCount++;
				break;
			case 'failed':
				result.failureCount++;
				break;
		}
	}

	return result;
}

// syncSingleSong handles syncing a single song. Any failure is returned as a "failed"
// SyncItemResult and the song is NOT marked synced — preserving the dirty state so a
// later sync retries it.
async function syncSingleSong(deps: AppleMusicDeps, songID: number): Promise<SyncItemResult> {
	const song = getSongReadable(deps.db, songID);
	if (!song) {
		console.error(`[AppleMusicSync] song_id=${songID} step=load_song error=song not found`);
		return { songId: songID, songName: '', status: 'failed', errorMessage: 'Failed to load song details' };
	}

	let appleMusicID = '';
	let status = '';

	// Check if we have an existing Apple Music ID
	if (song.appleMusicId != null && song.appleMusicId !== '') {
		try {
			const exists = await verifyAppleMusicTrack(deps, song.appleMusicId);
			if (exists) {
				appleMusicID = song.appleMusicId;
			}
			// else: track not found, need to search or add
		} catch (err) {
			console.error(
				`[AppleMusicSync] song_id=${song.id} song=${JSON.stringify(song.name)} step=verify_existing_track apple_music_id=${JSON.stringify(song.appleMusicId)} error=${errMsg(err)}`
			);
			appleMusicID = '';
		}
	}

	// If no valid Apple Music ID, search for track
	if (appleMusicID === '') {
		try {
			const foundID = await findAppleMusicTrack(deps, song);
			if (foundID !== '') {
				appleMusicID = foundID;
			}
		} catch (err) {
			console.error(
				`[AppleMusicSync] song_id=${song.id} song=${JSON.stringify(song.name)} step=find_track error=${errMsg(err)}`
			);
		}
	}

	// If track found, update it; otherwise, add it
	if (appleMusicID !== '') {
		try {
			await updateAppleMusicTrack(deps, appleMusicID, song);
		} catch (err) {
			console.error(
				`[AppleMusicSync] song_id=${song.id} song=${JSON.stringify(song.name)} step=update_track apple_music_id=${JSON.stringify(appleMusicID)} error=${errMsg(err)}`
			);
			return { songId: songID, songName: song.name, status: 'failed', errorMessage: `Failed to update track: ${errMsg(err)}` };
		}
		status = 'updated';
	} else {
		try {
			appleMusicID = await addTrackToAppleMusic(deps, song);
		} catch (err) {
			console.error(
				`[AppleMusicSync] song_id=${song.id} song=${JSON.stringify(song.name)} step=add_track filepath=${JSON.stringify(song.filepath)} error=${errMsg(err)}`
			);
			return { songId: songID, songName: song.name, status: 'failed', errorMessage: `Failed to add track: ${errMsg(err)}` };
		}
		status = 'added';
	}

	// Save Apple Music ID and mark as synced
	try {
		markSongSynced(deps.db, songID, appleMusicID);
	} catch (err) {
		console.error(
			`[AppleMusicSync] song_id=${song.id} song=${JSON.stringify(song.name)} step=mark_synced apple_music_id=${JSON.stringify(appleMusicID)} error=${errMsg(err)}`
		);
		return {
			songId: songID,
			songName: song.name,
			status: 'failed',
			appleMusicId: appleMusicID,
			errorMessage: `Failed to mark as synced: ${errMsg(err)}`
		};
	}

	return { songId: songID, songName: song.name, status, appleMusicId: appleMusicID };
}

// verifyAppleMusicTrack checks if a track with the given persistent ID exists.
async function verifyAppleMusicTrack(deps: AppleMusicDeps, persistentID: string): Promise<boolean> {
	const script = `
		tell application "Music"
			try
				first track whose persistent ID is "${escapeAppleScript(persistentID)}"
				return "true"
			on error
				return "false"
			end try
		end tell
	`;

	let out: string;
	try {
		out = await runAppleScriptOutput(deps, script);
	} catch (err) {
		throw new Error(`failed to verify track: ${errMsg(err)}`);
	}
	return out.trim() === 'true';
}

// findAppleMusicTrack searches the Apple Music library by name + artist. Returns the
// persistent ID if found, empty string if not.
async function findAppleMusicTrack(deps: AppleMusicDeps, song: SongReadable): Promise<string> {
	const script = `
		tell application "Music"
			set matches to (every track of playlist "Library" whose name is "${escapeAppleScript(song.name)}" and artist is "${escapeAppleScript(song.artist)}")
			if (count of matches) > 0 then
				return persistent ID of first item of matches
			else
				return ""
			end if
		end tell
	`;

	let out: string;
	try {
		out = await runAppleScriptOutput(deps, script);
	} catch (err) {
		throw new Error(`failed to search for track: ${errMsg(err)}`);
	}
	return out.trim();
}

// buildMetadataScript builds AppleScript lines to set metadata on a track variable.
function buildMetadataScript(trackVar: string, song: SongReadable): string {
	const lines: string[] = [];
	lines.push(`set name of ${trackVar} to "${escapeAppleScript(song.name)}"`);
	lines.push(`set artist of ${trackVar} to "${escapeAppleScript(song.artist)}"`);

	if (song.album != null) {
		lines.push(`set album of ${trackVar} to "${escapeAppleScript(song.album.name)}"`);
	}
	if (song.genre != null) {
		lines.push(`set genre of ${trackVar} to "${escapeAppleScript(song.genre)}"`);
	}
	if (song.year != null) {
		lines.push(`set year of ${trackVar} to ${song.year}`);
	}
	if (song.trackNumber != null) {
		lines.push(`set track number of ${trackVar} to ${song.trackNumber}`);
	}

	return lines.join('\n\t\t');
}

function resolveAppleMusicArtworkPath(deps: AppleMusicDeps, song: SongReadable): string {
	if (song.artworkPath != null && song.artworkPath !== '') {
		return staticFilePath(deps.staticPath, song.artworkPath);
	}
	if (song.album != null && song.album.artworkPath != null && song.album.artworkPath !== '') {
		return staticFilePath(deps.staticPath, song.album.artworkPath);
	}
	return '';
}

function buildArtworkScript(deps: AppleMusicDeps, trackVar: string, song: SongReadable): string {
	const artworkPath = resolveAppleMusicArtworkPath(deps, song);
	if (artworkPath === '') {
		return `if (count of artworks of ${trackVar}) > 0 then delete every artwork of ${trackVar}`;
	}

	return `
		set artworkFile to POSIX file "${escapeAppleScript(artworkPath)}"
		set artworkData to read artworkFile as picture
		if (count of artworks of ${trackVar}) = 0 then
			make new artwork at end of artworks of ${trackVar} with properties {data:artworkData}
		else
			set data of artwork 1 of ${trackVar} to artworkData
		end if
	`;
}

// updateAppleMusicTrack updates an existing track's metadata + artwork via AppleScript,
// after writing the source file's metadata.
async function updateAppleMusicTrack(
	deps: AppleMusicDeps,
	persistentID: string,
	song: SongReadable
): Promise<void> {
	try {
		await writeSongMetadataInternal(deps.db, deps.staticPath, song.id);
	} catch (err) {
		throw new Error(`failed to write source metadata before Apple Music sync: ${errMsg(err)}`);
	}

	const metadataLines = buildMetadataScript('t', song);
	const artworkLines = buildArtworkScript(deps, 't', song);
	const script = `
		tell application "Music"
			set t to first track whose persistent ID is "${escapeAppleScript(persistentID)}"
			${metadataLines}
			${artworkLines}
		end tell
	`;

	try {
		await runAppleScript(deps, script);
	} catch (err) {
		throw new Error(`failed to update track: ${errMsg(err)}`);
	}
}

// addTrackToAppleMusic adds a new track file to the library, returning its persistent ID.
async function addTrackToAppleMusic(deps: AppleMusicDeps, song: SongReadable): Promise<string> {
	if (song.filepath === '') {
		throw new Error('song has no filepath');
	}
	try {
		await writeSongMetadataInternal(deps.db, deps.staticPath, song.id);
	} catch (err) {
		throw new Error(`failed to write source metadata before adding to Apple Music: ${errMsg(err)}`);
	}

	let absPath: string;
	try {
		absPath = staticFilePath(deps.staticPath, song.filepath);
	} catch (err) {
		throw new Error(`failed to resolve filepath: ${errMsg(err)}`);
	}

	const metadataLines = buildMetadataScript('newTrack', song);
	const script = `
		tell application "Music"
			set newTrack to add POSIX file "${escapeAppleScript(absPath)}"
			${metadataLines}
			return persistent ID of newTrack
		end tell
	`;

	let out: string;
	try {
		out = await runAppleScriptOutput(deps, script);
	} catch (err) {
		throw new Error(`failed to add track: ${errMsg(err)}`);
	}
	return out.trim();
}

// markSongSynced flips synced=1 and saves the Apple Music ID for a single song.
export function markSongSynced(db: Database.Database, songID: number, appleMusicID: string): void {
	db.prepare(`UPDATE songs SET synced = 1, apple_music_id = ?, updated_at = ? WHERE id = ?`).run(
		appleMusicID,
		now(),
		songID
	);
}
