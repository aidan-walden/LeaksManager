import type { IpcApi } from '../../../../electron/ipc-handlers';
import type { IpcEvents } from '../../../../electron/ipc-events';

declare global {
	interface Window {
		api: RawIpcBindings;
	}
}

export type RawIpcBindings = IpcApi & IpcEvents;

export function getRawIpcBindings(): RawIpcBindings {
	return window.api;
}
