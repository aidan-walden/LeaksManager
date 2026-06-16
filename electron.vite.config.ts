import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// ponytail: main + preload only. The renderer is the existing SvelteKit app
// (adapter-static, SSR off), built by its own `pnpm --filter svelte build` and
// loaded by main.ts (dev server in dev, svelte/build/index.html in prod).
// Collapse the renderer into electron-vite's pipeline only if a reason appears.
//
// externalizeDepsPlugin keeps native/large deps (better-sqlite3, mediabunny) out
// of the bundle so they load from node_modules at runtime.
export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			lib: {
				entry: 'electron/main.ts'
			}
		}
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			lib: {
				entry: 'electron/preload.ts'
			}
		}
	}
});
