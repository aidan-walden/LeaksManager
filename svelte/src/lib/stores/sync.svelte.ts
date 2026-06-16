import { getContext, setContext } from 'svelte';

const SYNC_STATE_KEY = Symbol('sync-state');

export class SyncState {
	hasChanges = $state(false);
	isDismissed = $state(false);
	isSyncing = $state(false);
	isAppleMusicEnabled = $state(false);
	lastSyncError = $state<SyncErrorState | null>(null);

	configure(isEnabled: boolean, hasChanges = this.hasChanges) {
		this.isAppleMusicEnabled = isEnabled;
		this.hasChanges = isEnabled && hasChanges;
		if (!isEnabled) {
			this.isDismissed = false;
			this.isSyncing = false;
			this.lastSyncError = null;
		}
	}

	markChanged() {
		if (!this.isAppleMusicEnabled) return;
		this.hasChanges = true;
	}

	dismiss() {
		this.isDismissed = true;
	}

	startSync() {
		if (!this.isAppleMusicEnabled) return;
		this.isSyncing = true;
		this.lastSyncError = null;
	}

	finishSync(success: boolean, error?: SyncErrorState) {
		this.isSyncing = false;

		if (success) {
			this.hasChanges = false;
			this.isDismissed = false;
			this.lastSyncError = null;
		} else if (error) {
			this.lastSyncError = error;
		}
	}

	clearError() {
		this.lastSyncError = null;
	}

	get shouldShow() {
		return this.isAppleMusicEnabled && this.hasChanges && !this.isDismissed;
	}

	get hasError() {
		return this.lastSyncError !== null;
	}
}

type SyncErrorState = {
	message: string;
	failedCount: number;
	totalCount: number;
	timestamp: number;
};

export function createSyncState() {
	return new SyncState();
}

export function setSyncStateContext(syncState: SyncState) {
	setContext(SYNC_STATE_KEY, syncState);
	return syncState;
}

export function getSyncStateContext() {
	const syncState = getContext<SyncState | undefined>(SYNC_STATE_KEY);
	if (!syncState) {
		throw new Error('sync state context is not available');
	}

	return syncState;
}
