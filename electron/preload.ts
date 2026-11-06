import { contextBridge, ipcRenderer } from 'electron';
import { API_CHANNELS, API_EVENTS } from './channels';
import type { IpcEvents } from './ipc-events';

// Expose window.api with one method per IPC channel (T015). Method names mirror
// the renderer's RawIpcBindings shape so bindings.ts only swaps its source
// (window.api), not the call sites. Each method forwards its args to
// ipcRenderer.invoke(channel, ...args); errors reject through to the renderer.
const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
for (const [name, channel] of Object.entries(API_CHANNELS)) {
	api[name] = (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
}

// Returns an unsubscribe function. The wrapper keeps ipcRenderer's event object, which
// gives access to ipcRenderer itself, out of the renderer.
const events: IpcEvents = {
	OnSourceDownloadProgress(listener) {
		const forward = (_event: unknown, progress: Parameters<typeof listener>[0]) =>
			listener(progress);
		ipcRenderer.on(API_EVENTS.SourceDownloadProgress, forward);
		return () => ipcRenderer.removeListener(API_EVENTS.SourceDownloadProgress, forward);
	}
};

contextBridge.exposeInMainWorld('api', { ...api, ...events });
