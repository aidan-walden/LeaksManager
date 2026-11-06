import type { SourceDownloadProgress } from './domain/models';

// Renderer subscriptions to API_EVENTS. Each returns an unsubscribe function.
export interface IpcEvents {
	OnSourceDownloadProgress(listener: (progress: SourceDownloadProgress) => void): () => void;
}
