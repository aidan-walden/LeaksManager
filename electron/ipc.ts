import { ipcMain, type BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { API_CHANNELS, type ApiName } from './channels';
import { handlers } from './ipc-handlers';

// IPC bridge. A thrown error rejects the invoke and surfaces through the renderer's
// existing ipc-actions.ts notification path. args cross the IPC trust boundary untyped.

export interface IpcDeps {
	db: Database.Database;
	staticPath: string;
	window: BrowserWindow;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handler = (deps: IpcDeps, ...args: any[]) => unknown;

export function registerIpc(deps: IpcDeps): void {
	for (const name of Object.keys(API_CHANNELS) as ApiName[]) {
		ipcMain.handle(API_CHANNELS[name], async (_event, ...args) => handlers[name](deps, ...args));
	}
}
