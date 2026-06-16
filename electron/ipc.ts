import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { API_CHANNELS } from './channels';

// IPC bridge skeleton (replaces Wails' auto-bound *App methods). Every channel in
// contracts/ipc-channels.md is registered with a central error-to-reject wrapper;
// handlers are stubbed until their user story wires real domain logic
// (US1 T027, US2 T034, US3 T038). A thrown error rejects the invoke and surfaces
// through the renderer's existing wails-actions.ts notification path.

export interface IpcDeps {
	db: Database.Database;
	staticPath: string;
}

type Handler = (deps: IpcDeps, ...args: unknown[]) => unknown;

// Per-story handlers are added here; absent channels reject as "not implemented".
const handlers: Partial<Record<string, Handler>> = {};

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
