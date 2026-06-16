import { contextBridge } from 'electron';

// ponytail: Phase-1 stub. Real camelCased ipcRenderer.invoke wrappers per
// contracts/ipc-channels.md land in Phase 2 (T015). Empty surface for now so the
// renderer's missing-runtime fallback (bindings.ts) degrades cleanly.
contextBridge.exposeInMainWorld('api', {});
