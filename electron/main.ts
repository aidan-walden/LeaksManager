import { app, BrowserWindow, shell, session } from 'electron';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { resolveAppPaths } from './paths';
import { openDatabase } from './db/connection';
import { migrate } from './db/migrate';
import { registerAppProtocolScheme, registerAppProtocol } from './assets';
import { registerIpc, type IpcDeps } from './ipc';

// App lifecycle: resolve paths, open the real DB, run migrations, register the
// app:// asset protocol and the IPC bridge, then load the SvelteKit renderer.

const DEV_SERVER_URL = 'http://localhost:5173';
let db: Database.Database | null = null;

// Origins the renderer is allowed to live at: the packaged file:// bundle and the
// app:// asset protocol always; the Vite dev server only in development.
function isAllowedNavigation(target: string): boolean {
	if (target.startsWith('app://') || target.startsWith('file://')) return true;
	if (!app.isPackaged && target.startsWith(DEV_SERVER_URL)) return true;
	return false;
}

// Lock the renderer down: it must never navigate to a remote origin or spawn
// arbitrary child windows. External links open in the user's browser instead.
function hardenWebContents(contents: Electron.WebContents): void {
	contents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url)) void shell.openExternal(url);
		return { action: 'deny' };
	});
	contents.on('will-navigate', (event, url) => {
		if (!isAllowedNavigation(url)) event.preventDefault();
	});
}

// A defense-in-depth CSP for the packaged app. Not applied in dev, where the Vite
// server needs eval + websocket HMR. SvelteKit's static build inlines its hydration
// script and Tailwind styles (hence 'unsafe-inline'); everything else is same-origin
// plus the app:// media protocol, and remote script/frame/object origins are blocked.
function applyContentSecurityPolicy(): void {
	if (!app.isPackaged) return;
	const policy = [
		"default-src 'self' app:",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' app: data:",
		"media-src 'self' app:",
		"font-src 'self' app: data:",
		"connect-src 'self' app:",
		"object-src 'none'",
		"frame-src 'none'",
		"base-uri 'self'"
	].join('; ');
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': [policy]
			}
		});
	});
}

function migrationsDir(): string {
	// Dev: read repo migrations. Prod: bundled into resources.
	return app.isPackaged
		? join(process.resourcesPath, 'migrations')
		: join(app.getAppPath(), 'electron', 'migrations');
}

function createWindow(): BrowserWindow {
	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		webPreferences: {
			preload: join(__dirname, '../preload/preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			// Pinned explicitly rather than relying on Electron defaults.
			sandbox: true,
			webSecurity: true
		}
	});

	hardenWebContents(win.webContents);

	if (app.isPackaged) {
		// Renderer is built by SvelteKit (adapter-static) into svelte/build, not by electron-vite.
		win.loadFile(join(__dirname, '../../svelte/build/index.html'));
	} else {
		win.loadURL(DEV_SERVER_URL);
		// ponytail: retry until the SvelteKit dev server is up, so a combined
		// `dev` script can launch Electron and Vite together without wait-on.
		win.webContents.on('did-fail-load', () => {
			setTimeout(() => win.loadURL(DEV_SERVER_URL), 300);
		});
	}

	return win;
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

	applyContentSecurityPolicy();
	registerAppProtocol(staticPath);

	// Hoist deps so the `activate` handler can refresh the window reference that
	// registerIpc's closure sees. On macOS, closing then reopening the window
	// (Dock click) creates a new BrowserWindow; without this, IPC handlers would
	// keep dialoging on the destroyed original window.
	const deps: IpcDeps = { db, staticPath, window: createWindow() };
	registerIpc(deps);

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			deps.window = createWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
	db?.close();
	db = null;
});
