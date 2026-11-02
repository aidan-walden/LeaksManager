import type { IpcApi } from '../../../../electron/ipc-handlers';

declare global {
	interface Window {
		api: RawIpcBindings;
	}
}

export type RawIpcBindings = IpcApi;

export function getRawIpcBindings(): RawIpcBindings {
	return window.api;
}
