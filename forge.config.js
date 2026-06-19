// electron-forge config — PACKAGER/MAKER only. electron-vite owns bundling
// (electron/main.ts -> out/main/main.js, preload -> out/preload/preload.js) and
// SvelteKit (adapter-static) owns the renderer (svelte/build). Forge sits on top:
// it copies the prebuilt output into a .app, packs an asar, and runs the makers.
//
// Build order (see package.json "package"/"make" scripts) is non-negotiable:
//   electron-vite build -> svelte build -> electron-rebuild (Electron ABI) -> forge.
// electron-rebuild rebuilds better-sqlite3 against ELECTRON's NODE_MODULE_VERSION;
// the .node would otherwise be a Node-ABI build and the app would die at boot with
// NODE_MODULE_VERSION mismatch (the #1 native-module packaging failure).

const path = require('node:path');

// What the packaged app actually needs at runtime:
//   out/                  — main + preload bundles (electron-vite)
//   svelte/build/         — renderer (loadFile target in prod, see electron/main.ts)
//   package.json          — Electron reads "main"
//   node_modules          — better-sqlite3 (+ its `bindings` dep) and mediabunny
//                           load from here (electron-vite externalizes them). With
//                           node-linker=hoisted (.npmrc, required by Forge for pnpm)
//                           node_modules is flat, so dropping dev-only top-level
//                           packages leaves exactly the runtime tree.
// Everything else is excluded via the ignore() predicate below.
//
// Migrations: electron/main.ts reads them from process.resourcesPath/migrations in
// prod. backend/ is excluded from the app bundle, so the migrations are copied in as
// an extraResource (lands next to the .app's Resources, i.e. resourcesPath).

// Runtime deps that MUST ship (better-sqlite3 + transitive, mediabunny). With a
// hoisted/flat node_modules we keep these top-level trees and everything they pull
// in, and drop the dev-only packages below. Forge auto-excludes the `electron` dep.
const RUNTIME_KEEP = new Set([
	'better-sqlite3',
	'mediabunny',
	'bindings', // better-sqlite3 require()s this at runtime to locate the .node
	'file-uri-to-path', // bindings' dep
	'prebuild-install' // better-sqlite3 dep (referenced from its require graph)
]);

module.exports = {
	// Forge output goes to dist-forge/, NOT out/. out/ holds electron-vite's main +
	// preload bundles and is part of the runtime payload — if Forge also wrote there,
	// electron-packager auto-ignores its own output dir and would drop out/main/main.js
	// (the app's main entry), failing with "main entry point not found".
	outDir: 'dist-forge',
	packagerConfig: {
		name: 'Leaks Manager',
		asar: true,
		// pnpm hoisted: top-level node_modules entries are real, self-contained dirs,
		// so we don't need npm's prune (which doesn't understand pnpm anyway).
		prune: false,
		derefSymlinks: true,
		extraResource: [path.resolve(__dirname, 'backend', 'migrations')],
		// ignore is an ALLOWLIST: return true to EXCLUDE a path. We keep only the
		// runtime payload and exclude everything else (backend/, electron/ source,
		// svelte/src, specs/, *.go, build/, dev node_modules, the .pnpm store, etc.).
		ignore: (file) => {
			if (file === '') return false; // project root

			// Runtime payload.
			if (file === '/package.json') return false;
			if (file.startsWith('/out')) return false;
			// Keep svelte/build (the renderer). The walker must be allowed to descend
			// into /svelte itself, so keep the bare dir; keep everything under build;
			// exclude the rest of svelte/ (src, node_modules, config, etc.).
			if (file === '/svelte') return false;
			if (file === '/svelte/build' || file.startsWith('/svelte/build/')) return false;
			if (file.startsWith('/svelte/')) return true;

			// node_modules: keep only the runtime dep trees (flat, hoisted layout).
			if (file === '/node_modules') return false;
			if (file.startsWith('/node_modules/')) {
				const top = file.split('/')[2];
				// Drop the .pnpm hardlink store and all dev-only packages.
				return !RUNTIME_KEEP.has(top);
			}

			return true; // exclude everything else
		}
	},
	rebuildConfig: {
		// We rebuild better-sqlite3 ourselves via the electron-rebuild step in the
		// package/make scripts (keeps the ABI step explicit and pnpm-friendly).
		// Disable Forge's own rebuild so it doesn't fight pnpm's layout.
		onlyModules: []
	},
	makers: [
		// macOS — built on this host. zip is the lazy must-have; dmg is the nicety.
		{ name: '@electron-forge/maker-zip', platforms: ['darwin'] },
		{ name: '@electron-forge/maker-dmg', platforms: ['darwin'], config: {} },
		// Windows — configured, NOT built here. Needs a Windows host/CI.
		{
			name: '@electron-forge/maker-squirrel',
			platforms: ['win32'],
			config: { name: 'leaks_manager' }
		},
		// Linux — configured, NOT built here. Needs a Linux host/CI.
		{
			name: '@electron-forge/maker-deb',
			platforms: ['linux'],
			config: {}
		}
	],
	plugins: [
		// Unpacks *.node out of the asar (better-sqlite3's prebuilt binary) into
		// app.asar.unpacked so it can be dlopen'd at runtime.
		{ name: '@electron-forge/plugin-auto-unpack-natives', config: {} }
	]
};
