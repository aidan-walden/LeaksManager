import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from './db/migrate';
import { configureConnection } from './db/connection';
import { createArtist } from './domain/artists';
import { createSong } from './domain/songs';
import { syncSongsToAppleMusic } from './apple-music';
import type { IpcDeps } from './ipc';

type ScriptStep = 'verify' | 'find' | 'add' | 'update';
type ScriptResult = string | Error;

const { osascript } = vi.hoisted(() => ({
	osascript: vi.fn<(step: ScriptStep, args: string[]) => string | Error>()
}));

function scriptStep(script: string): ScriptStep {
	if (script.includes('return "true"')) return 'verify';
	if (script.includes('playlist "Library"')) return 'find';
	if (script.includes('set newTrack to add')) return 'add';
	return 'update';
}

vi.mock('node:child_process', () => ({
	execFile: (
		command: string,
		args: string[],
		callback: (err: Error | null, out?: { stdout: string }) => void
	) => {
		if (command !== 'osascript') return callback(null, { stdout: '' });
		const [, script, ...argv] = args;
		const result = osascript(scriptStep(script), argv);
		if (result instanceof Error) callback(result);
		else callback(null, { stdout: `${result}\n` });
	}
}));
vi.mock('electron', () => ({ dialog: {} }));
vi.mock('./metadata', () => ({ writeMetadata: vi.fn(async () => {}) }));

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const TIMEOUT = new Error('AppleEvent timed out (-1712)');

describe('syncSongsToAppleMusic', () => {
	const platform = process.platform;
	let db: Database.Database;
	let songId: number;

	beforeEach(() => {
		Object.defineProperty(process, 'platform', { value: 'darwin' });
		vi.spyOn(console, 'error').mockImplementation(() => {});
		osascript.mockReset();
		db = new Database(':memory:');
		configureConnection(db);
		migrate(db, MIGRATIONS_DIR);
		const artist = createArtist(db, { name: 'Artist' });
		songId = createSong(db, {
			name: 'Song',
			filepath: 'uploads/songs/song.mp3',
			artistIds: [artist.id],
			producerIds: []
		}).id;
		db.prepare(`UPDATE songs SET apple_music_id = 'OLDID', synced = 0 WHERE id = ?`).run(songId);
	});

	afterEach(() => {
		Object.defineProperty(process, 'platform', { value: platform });
		vi.restoreAllMocks();
	});

	const sync = () => syncSongsToAppleMusic({ db, staticPath: '/static' } as IpcDeps);
	const fakeMusic = (results: Partial<Record<ScriptStep, ScriptResult>>) =>
		osascript.mockImplementation((step) => results[step] ?? '');
	const row = () => db.prepare('SELECT synced, apple_music_id FROM songs WHERE id = ?').get(songId);
	const steps = () => osascript.mock.calls.map(([step]) => step);

	it.each<[string, Partial<Record<ScriptStep, ScriptResult>>]>([
		['verify', { verify: TIMEOUT }],
		['find', { verify: 'false', find: TIMEOUT }]
	])('fails without adding a track when %s errors', async (_step, music) => {
		fakeMusic(music);

		const { results, failureCount } = await sync();

		expect(failureCount).toBe(1);
		expect(results[0]).toMatchObject({ status: 'failed' });
		expect(results[0].errorMessage).toContain('timed out');
		expect(steps()).not.toContain('add');
		expect(row()).toEqual({ synced: 0, apple_music_id: 'OLDID' });
	});

	it('adds a track when both lookups succeed and find nothing', async () => {
		fakeMusic({ verify: 'false', find: '', add: 'NEWID' });

		const { results } = await sync();

		expect(results[0]).toMatchObject({ status: 'added', appleMusicId: 'NEWID' });
		expect(row()).toEqual({ synced: 1, apple_music_id: 'NEWID' });
	});

	it('updates the saved track when verify finds it', async () => {
		fakeMusic({ verify: 'true' });

		const { results } = await sync();

		expect(results[0]).toMatchObject({ status: 'updated', appleMusicId: 'OLDID' });
		expect(steps()).toEqual(['verify', 'update']);
	});
});
