import { getContext, setContext } from 'svelte';

const SYNC_STATE_KEY = Symbol('sync-state');

export class SyncState {
	hasChanges = $state(false);
	isDismissed = $state(false);
	isSyncing = $state(false);
	isAppleMusicEnabled = $state(false);
	syncProgress = $state<SyncProgress | null>(null);
	lastSyncError = $state<SyncErrorState | null>(null);

	configure(isEnabled: boolean, hasChanges = this.hasChanges) {
		this.isAppleMusicEnabled = isEnabled;
		this.hasChanges = isEnabled && hasChanges;
		if (!isEnabled) {
			this.isDismissed = false;
			this.isSyncing = false;
			this.syncProgress = null;
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
		this.syncProgress = { current: 0, total: 0 };
		this.lastSyncError = null;
	}

	updateProgress(current: number, total: number) {
		if (this.syncProgress) {
			this.syncProgress.current = current;
			this.syncProgress.total = total;
		}
	}

	finishSync(success: boolean, error?: SyncErrorState) {
		this.isSyncing = false;
		this.syncProgress = null;

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

	get progressPercent() {
		if (!this.syncProgress || this.syncProgress.total === 0) return 0;
		return Math.round((this.syncProgress.current / this.syncProgress.total) * 100);
	}

	get hasError() {
		return this.lastSyncError !== null;
	}
}

type SyncProgress = {
	current: number;
	total: number;
};

type SyncErrorState = {
	message: string;
	failedCount: number;
	totalCount: number;
	timestamp: number;
};

export type SyncStateLike = Pick<
	SyncState,
	'configure' | 'markChanged' | 'dismiss' | 'startSync' | 'updateProgress' | 'finishSync' | 'clearError'
> & {
	readonly hasChanges: boolean;
	readonly isDismissed: boolean;
	readonly isSyncing: boolean;
	readonly isAppleMusicEnabled: boolean;
	readonly syncProgress: SyncProgress | null;
	readonly lastSyncError: SyncErrorState | null;
	readonly shouldShow: boolean;
	readonly progressPercent: number;
	readonly hasError: boolean;
};

export function createSyncState() {
	return new SyncState();
}

export function setSyncStateContext(syncState: SyncStateLike) {
	setContext(SYNC_STATE_KEY, syncState);
	return syncState;
}

export function getSyncStateContext() {
	const syncState = getContext<SyncStateLike | undefined>(SYNC_STATE_KEY);
	if (!syncState) {
		throw new Error('sync state context is not available');
	}

	return syncState;
}
