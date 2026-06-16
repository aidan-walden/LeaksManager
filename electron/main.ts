import { app, BrowserWindow } from 'electron';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { resolveAppPaths } from './paths';
import { openDatabase } from './db/connection';
import { migrate } from './db/migrate';
import { registerAppProtocolScheme, registerAppProtocol } from './assets';
import { registerIpc } from './ipc';

// App lifecycle (replaces main.go + app.go Startup/Shutdown): resolve paths, open
// the real DB, run migrations, register the app:// asset protocol and the IPC
// bridge, then load the SvelteKit renderer.

const DEV_SERVER_URL = 'http://localhost:5173';
let db: Database.Database | null = null;

function migrationsDir(): string {
	// Dev: reuse backend/migrations verbatim. Prod: bundled into resources (Phase 6).
	return app.isPackaged
		? join(process.resourcesPath, 'migrations')
		: join(app.getAppPath(), 'backend', 'migrations');
}

function createWindow(): void {
	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		webPreferences: {
			preload: join(__dirname, '../preload/preload.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});

	if (app.isPackaged) {
		// Renderer is built by SvelteKit (adapter-static) into svelte/build, not by electron-vite.
		win.loadFile(join(__dirname, '../../svelte/build/index.html'));
	} else {
		win.loadURL(DEV_SERVER_URL);
	}
}

// Privileged scheme registration must happen before the app is ready.
registerAppProtocolScheme();

app.whenReady().then(() => {
	const { dbPath, staticPath } = resolveAppPaths({
		isPackaged: app.isPackaged,
		userData: app.getPath('userData')
	});

	mkdirSync(join(staticPath, 'uploads', 'songs'), { recursive: true });
	mkdirSync(join(staticPath, 'uploads', 'artwork'), { recursive: true });
	mkdirSync(dirname(dbPath), { recursive: true });

	db = openDatabase(dbPath);
	migrate(db, migrationsDir());

	registerAppProtocol(staticPath);
	registerIpc({ db, staticPath });

	createWindow();
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
	db?.close();
	db = null;
});
