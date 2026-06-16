import { contextBridge, ipcRenderer } from 'electron';
import { API_CHANNELS } from './channels';

// Expose window.api with one method per IPC channel (T015). Method names mirror
// the renderer's RawWailsAppBindings shape so bindings.ts only swaps its source
// (window.go → window.api), not the call sites. Each method forwards its args to
// ipcRenderer.invoke(channel, ...args); errors reject through to the renderer.
const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
for (const [name, channel] of Object.entries(API_CHANNELS)) {
	api[name] = (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('api', api);
