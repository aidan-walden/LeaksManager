import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

// ponytail: Phase-1 stub. Custom protocol, migrations, and IPC registration land
// in Phase 2 (T012–T014). For now this just proves the toolchain boots a window.

const DEV_SERVER_URL = 'http://localhost:5173';

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

app.whenReady().then(() => {
	createWindow();
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
