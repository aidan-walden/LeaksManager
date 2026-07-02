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
