import { ipcMain, type BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { API_CHANNELS } from './channels';
import { us1Handlers } from './ipc-handlers';

// IPC bridge (replaces Wails' auto-bound *App methods). Every channel in
// contracts/ipc-channels.md is registered with a central error-to-reject wrapper;
// per-story handler maps are merged in (US1 + US2 wired, US3 T038 to come).
// A thrown error rejects the invoke and surfaces through the renderer's existing
// wails-actions.ts notification path. args cross the IPC trust boundary untyped.

export interface IpcDeps {
	db: Database.Database;
	staticPath: string;
	window: BrowserWindow;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handler = (deps: IpcDeps, ...args: any[]) => unknown;

// Absent channels reject as "not implemented" until their story wires them.
const handlers: Partial<Record<string, Handler>> = { ...us1Handlers };

export function registerIpc(deps: IpcDeps): void {
	for (const channel of Object.values(API_CHANNELS)) {
		ipcMain.handle(channel, async (_event, ...args) => {
			const handler = handlers[channel];
			if (!handler) {
				throw new Error(`not implemented: ${channel}`);
			}
			return handler(deps, ...args);
		});
	}
}
