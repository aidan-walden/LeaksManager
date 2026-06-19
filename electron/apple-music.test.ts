import { describe, it, expect } from 'vitest';
import { escapeAppleScript } from './apple-music';

// The one pure, testable bit of the Apple Music port: AppleScript string escaping is a
// trust boundary (song titles/paths flow into osascript). Mirror the Go oracle's
// escapeAppleScript — backslashes first, then double quotes.
describe('escapeAppleScript', () => {
	it('escapes double quotes', () => {
		expect(escapeAppleScript('She said "hi"')).toBe('She said \\"hi\\"');
	});

	it('escapes backslashes before quotes', () => {
		expect(escapeAppleScript('a\\b"c')).toBe('a\\\\b\\"c');
	});

	it('leaves plain strings unchanged', () => {
		expect(escapeAppleScript('Hello World')).toBe('Hello World');
	});
});
