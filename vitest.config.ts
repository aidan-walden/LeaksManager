import { defineConfig } from 'vitest/config';

// Main-process tests (Electron main, Node environment). The renderer keeps its
// own jsdom config in svelte/vite.config.ts and runs via `pnpm --filter svelte`.
// ponytail: two separate configs instead of a vitest workspace — merge only if
// the duplication actually bites.
export default defineConfig({
	test: {
		include: ['electron/**/*.test.ts'],
		environment: 'node',
		globals: true,
		// ponytail: no main-process tests until Phase 2 (T017); don't fail the
		// `pnpm test` leg on an empty suite until then.
		passWithNoTests: true
	}
});
