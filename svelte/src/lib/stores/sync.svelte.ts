export class SyncState {
    hasChanges = $state(false);
    isDismissed = $state(false);
    isSyncing = $state(false);
    syncProgress = $state<SyncProgress | null>(null);
    lastSyncError = $state<SyncErrorState | null>(null);

    markChanged() {
        this.hasChanges = true;
    }

    dismiss() {
        this.isDismissed = true;
    }

    startSync() {
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
            // keep hasChanges true so card remains visible
        }
    }

    clearError() {
        this.lastSyncError = null;
    }

    get shouldShow() {
        return this.hasChanges && !this.isDismissed;
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

export const syncState = new SyncState();