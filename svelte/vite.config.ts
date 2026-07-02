import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// main.ts hardcodes localhost:5173; strictPort fails loud instead of
		// drifting to 5174 and leaving Electron on a stale/wrong server.
		port: 5173,
		strictPort: true,
		fs: {
			allow: [searchForWorkspaceRoot(process.cwd())]
		}
	},
	test: {
		environment: 'jsdom',
		globals: true
	}
});
