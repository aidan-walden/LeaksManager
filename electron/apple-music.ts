import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { dialog } from 'electron';
import type Database from 'better-sqlite3';
import type { IpcDeps } from './ipc';
import type { SyncResult, SyncItemResult, SongReadable } from './domain/models';
import { getSongReadable, writeSongMetadataInternal } from './domain/songs';
import { getSettings } from './domain/settings';
import { staticFilePath } from './paths';
import { now } from './domain/rows';

// Song titles and paths are untrusted, so they are NEVER interpolated into the script
// source: they reach osascript as runtime arguments and are read inside an `on run argv`
// handler as `item N of argv`.

const execFileP = promisify(execFile);

async function isAppleMusicRunning(): Promise<boolean> {
	try {
		await execFileP('pgrep', ['-x', 'Music']);
		return true;
	} catch {
		return false;
	}
}

async function ensureAppleMusicRunning(deps: IpcDeps): Promise<void> {
	if (await isAppleMusicRunning()) {
		return;
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

async function runAppleScriptCommand(script: string, args: string[] = []): Promise<string> {
	try {
		const { stdout } = await execFileP('osascript', ['-e', script, ...args]);
		return stdout;
	} catch (err) {
		const e = err as { stderr?: string; message?: string };
		const out = (e.stderr ?? '').trim();
		console.error(
			`[AppleScript] osascript failed: ${e.message}\n[AppleScript] output:\n${out}\n[AppleScript] script:\n${script}`
		);
		if (out.length > 0) {
			throw new Error(`${e.message}: ${out}`);
		}
		throw err;
	}
}

function errMsg(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function logSyncError(song: SongReadable, step: string, err: unknown): void {
	console.error(
		`[AppleMusicSync] song_id=${song.id} song=${JSON.stringify(song.name)} step=${step} error=${errMsg(err)}`
	);
}

// Syncs all unsynced songs to Apple Music, returning per-song results. A disabled import
// setting is a no-op. A single song's failure is captured in its result and must NOT mark
// that song synced.
export async function syncSongsToAppleMusic(deps: IpcDeps): Promise<SyncResult> {
	if (process.platform !== 'darwin') {
		throw new Error('Apple Music sync is only available on macOS');
	}

	const result: SyncResult = {
		totalSongs: 0,
		successCount: 0,
		failureCount: 0,
		addedCount: 0,
		updatedCount: 0,
		results: [],
		completedAt: now()
	};
	if (!getSettings(deps.db).importToAppleMusic) {
		return result;
	}

	await ensureAppleMusicRunning(deps);

	const rows = deps.db
		.prepare(`SELECT id FROM songs WHERE synced = 0 ORDER BY id`)
		.all() as { id: number }[];
	result.totalSongs = rows.length;

	for (const { id } of rows) {
		const itemResult = await syncSingleSong(deps, id);
		result.results.push(itemResult);

		if (itemResult.status === 'failed') {
			result.failureCount++;
		} else {
			result.successCount++;
			if (itemResult.status === 'added') result.addedCount++;
			else result.updatedCount++;
		}
	}

	return result;
}

// Finds the song's track in Apple Music: first by its saved persistent ID, then by name
// and artist. Returns '' when no track is found. A lookup error counts as "not found", so
// the caller adds the track.
async function findExistingTrack(song: SongReadable): Promise<string> {
	if (song.appleMusicId) {
		try {
			if (await verifyAppleMusicTrack(song.appleMusicId)) return song.appleMusicId;
		} catch (err) {
			logSyncError(song, 'verify_existing_track', err);
		}
	}
	try {
		return await findAppleMusicTrack(song);
	} catch (err) {
		logSyncError(song, 'find_track', err);
		return '';
	}
}

// Any failure returns a "failed" item and leaves the song dirty, so a later sync retries it.
async function syncSingleSong(deps: IpcDeps, songID: number): Promise<SyncItemResult> {
	const song = getSongReadable(deps.db, songID);
	if (!song) {
		console.error(`[AppleMusicSync] song_id=${songID} step=load_song error=song not found`);
		return { songId: songID, songName: '', status: 'failed', errorMessage: 'Failed to load song details' };
	}
	const failed = (step: string, message: string, err: unknown, appleMusicId?: string): SyncItemResult => {
		logSyncError(song, step, err);
		return {
			songId: songID,
			songName: song.name,
			status: 'failed',
			appleMusicId,
			errorMessage: `${message}: ${errMsg(err)}`
		};
	};

	try {
		await writeSongMetadataInternal(deps.db, deps.staticPath, song.id);
	} catch (err) {
		return failed('write_metadata', 'Failed to write source metadata', err);
	}

	let appleMusicID = await findExistingTrack(song);
	const status = appleMusicID !== '' ? 'updated' : 'added';

	if (status === 'updated') {
		try {
			await updateAppleMusicTrack(deps, appleMusicID, song);
		} catch (err) {
			return failed('update_track', 'Failed to update track', err);
		}
	} else {
		try {
			appleMusicID = await addTrackToAppleMusic(deps, song);
		} catch (err) {
			return failed('add_track', 'Failed to add track', err);
		}
	}

	try {
		markSongSynced(deps.db, songID, appleMusicID);
	} catch (err) {
		return failed('mark_synced', 'Failed to mark as synced', err, appleMusicID);
	}

	return { songId: songID, songName: song.name, status, appleMusicId: appleMusicID };
}

// verifyAppleMusicTrack checks if a track with the given persistent ID exists.
async function verifyAppleMusicTrack(persistentID: string): Promise<boolean> {
	const script = `
		on run argv
			tell application "Music"
				try
					first track whose persistent ID is (item 1 of argv)
					return "true"
				on error
					return "false"
				end try
			end tell
		end run
	`;

	return (await runAppleScriptCommand(script, [persistentID])).trim() === 'true';
}

// findAppleMusicTrack searches the Apple Music library by name + artist. Returns the
// persistent ID if found, empty string if not.
async function findAppleMusicTrack(song: SongReadable): Promise<string> {
	const script = `
		on run argv
			tell application "Music"
				set matches to (every track of playlist "Library" whose name is (item 1 of argv) and artist is (item 2 of argv))
				if (count of matches) > 0 then
					return persistent ID of first item of matches
				else
					return ""
				end if
			end tell
		end run
	`;

	return (await runAppleScriptCommand(script, [song.name, song.artist])).trim();
}

// buildMetadataScript builds AppleScript lines to set metadata on a track variable.
// Untrusted text values (name/artist/album/genre) are read from argv: `argStart` is the
// 1-based argv index of the first value this builder consumes. Returns the joined lines and
// the raw values to append to the runner's args array, in argv order. Numeric values
// (year/track number) are safe to interpolate directly.
function buildMetadataScript(
	trackVar: string,
	song: SongReadable,
	argStart: number
): { script: string; args: string[] } {
	const lines: string[] = [];
	const args: string[] = [];
	const nextArg = (value: string): string => {
		args.push(value);
		return `(item ${argStart + args.length - 1} of argv)`;
	};

	lines.push(`set name of ${trackVar} to ${nextArg(song.name)}`);
	lines.push(`set artist of ${trackVar} to ${nextArg(song.artist)}`);

	if (song.album != null) {
		lines.push(`set album of ${trackVar} to ${nextArg(song.album.name)}`);
	}
	if (song.genre != null) {
		lines.push(`set genre of ${trackVar} to ${nextArg(song.genre)}`);
	}
	// year/track number are interpolated into the script source (not passed via argv),
	// so coerce to a finite integer first. This upholds the "these are numeric" contract
	// at runtime rather than trusting the type — a non-numeric value would otherwise be
	// injected verbatim into the AppleScript. A non-finite value is simply skipped.
	if (song.year != null && Number.isFinite(Number(song.year))) {
		lines.push(`set year of ${trackVar} to ${Math.trunc(Number(song.year))}`);
	}
	if (song.trackNumber != null && Number.isFinite(Number(song.trackNumber))) {
		lines.push(`set track number of ${trackVar} to ${Math.trunc(Number(song.trackNumber))}`);
	}

	return { script: lines.join('\n\t\t'), args };
}

function resolveAppleMusicArtworkPath(deps: IpcDeps, song: SongReadable): string {
	const artwork = song.artworkPath || song.album?.artworkPath;
	return artwork ? staticFilePath(deps.staticPath, artwork) : '';
}

// buildArtworkScript builds AppleScript lines to set/clear artwork on a track variable.
// The artwork path is untrusted and read from argv item `argStart` when present.
function buildArtworkScript(
	deps: IpcDeps,
	trackVar: string,
	song: SongReadable,
	argStart: number
): { script: string; args: string[] } {
	const artworkPath = resolveAppleMusicArtworkPath(deps, song);
	if (artworkPath === '') {
		return {
			script: `if (count of artworks of ${trackVar}) > 0 then delete every artwork of ${trackVar}`,
			args: []
		};
	}

	return {
		script: `
		set artworkFile to POSIX file (item ${argStart} of argv)
		set artworkData to read artworkFile as picture
		if (count of artworks of ${trackVar}) = 0 then
			make new artwork at end of artworks of ${trackVar} with properties {data:artworkData}
		else
			set data of artwork 1 of ${trackVar} to artworkData
		end if
	`,
		args: [artworkPath]
	};
}

// Updates an existing track's metadata and artwork.
async function updateAppleMusicTrack(
	deps: IpcDeps,
	persistentID: string,
	song: SongReadable
): Promise<void> {
	// argv: item 1 = persistent ID, then metadata values, then the artwork path.
	const metadata = buildMetadataScript('t', song, 2);
	const artwork = buildArtworkScript(deps, 't', song, 2 + metadata.args.length);
	const args = [persistentID, ...metadata.args, ...artwork.args];
	const script = `
		on run argv
			tell application "Music"
				set t to first track whose persistent ID is (item 1 of argv)
				${metadata.script}
				${artwork.script}
			end tell
		end run
	`;

	await runAppleScriptCommand(script, args);
}

// Adds a new track file to the library, returning its persistent ID.
async function addTrackToAppleMusic(deps: IpcDeps, song: SongReadable): Promise<string> {
	// argv: item 1 = POSIX path, then metadata values.
	const metadata = buildMetadataScript('newTrack', song, 2);
	const args = [staticFilePath(deps.staticPath, song.filepath), ...metadata.args];
	const script = `
		on run argv
			tell application "Music"
				set newTrack to add POSIX file (item 1 of argv)
				${metadata.script}
				return persistent ID of newTrack
			end tell
		end run
	`;

	return (await runAppleScriptCommand(script, args)).trim();
}

function markSongSynced(db: Database.Database, songID: number, appleMusicID: string): void {
	db.prepare(`UPDATE songs SET synced = 1, apple_music_id = ?, updated_at = ? WHERE id = ?`).run(
		appleMusicID,
		now(),
		songID
	);
}
