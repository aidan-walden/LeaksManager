import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// Security regression: untrusted song/path values must reach osascript as runtime argv
// arguments (data), never interpolated into the script source. A value containing a double
// quote AND a newline must round-trip verbatim without breaking out of / injecting into the
// script. This mirrors how the apple-music.ts builders invoke
// execFile('osascript', ['-e', script, ...args]) with an `on run argv` handler.
describe('osascript argv injection boundary', () => {
	it.runIf(process.platform === 'darwin')(
		'passes a value with a quote and newline as literal data',
		async () => {
			const evil = 'He said "hi"\nDROP';
			const script = 'on run argv\nreturn item 1 of argv\nend run';
			const { stdout } = await execFileP('osascript', ['-e', script, evil]);
			// osascript echoes the argv item verbatim (it appends a trailing newline).
			expect(stdout).toBe(`${evil}\n`);
		}
	);
});
